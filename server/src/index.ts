import express from "express";
import http from "http";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Server } from "socket.io";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-key-change-in-production";
const MESSAGE_ENCRYPTION_KEY = crypto.createHash("sha256").update(process.env.MESSAGE_ENCRYPTION_KEY || JWT_SECRET).digest();

function encryptMessageContent(content: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MESSAGE_ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(content, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptMessageContent(encryptedContent: string): string {
  const data = Buffer.from(encryptedContent, "base64");
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const ciphertext = data.slice(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", MESSAGE_ENCRYPTION_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

const uploadsDir = path.join(__dirname, "..", "uploads");
const avatarUploadsDir = path.join(uploadsDir, "avatars");
const allowedAvatarTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"]
]);
const maxAvatarBytes = 3 * 1024 * 1024;

function signToken(userId: number, username: string): string {
  return jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: "7d" });
}

function normalizeUsername(rawUsername: string): string {
  return rawUsername.startsWith("@") ? rawUsername.slice(1) : rawUsername;
}

function getAuthToken(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

function getAuthenticatedUser(req: express.Request) {
  const token = getAuthToken(req);
  if (!token) return null;

  try {
    return jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
  } catch {
    return null;
  }
}

function isAdminUsername(username: string) {
  return normalizeUsername(username).toLowerCase() === "admin";
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "6mb" }));
app.use("/uploads", express.static(uploadsDir));

app.get("/", (_req, res) => {
  res.json({ status: "ok", message: "Messenger server is running" });
});

app.post("/api/uploads/avatar", async (req, res) => {
  try {
    const { fileName, mimeType, dataUrl } = req.body as {
      fileName?: string;
      mimeType?: string;
      dataUrl?: string;
    };

    const extension = mimeType ? allowedAvatarTypes.get(mimeType) : undefined;
    if (!extension || !dataUrl) {
      return res.status(400).json({ error: "Only jpg, png, webp, and gif avatar files are allowed" });
    }

    const base64 = dataUrl.includes(",") ? dataUrl.split(",").pop() : dataUrl;
    if (!base64) {
      return res.status(400).json({ error: "Avatar file is empty" });
    }

    const fileBuffer = Buffer.from(base64, "base64");
    if (fileBuffer.length > maxAvatarBytes) {
      return res.status(400).json({ error: "Avatar file must be 3MB or smaller" });
    }

    await fs.mkdir(avatarUploadsDir, { recursive: true });

    const safeBaseName = path
      .parse(fileName || "avatar")
      .name
      .replace(/[^a-z0-9_-]/gi, "-")
      .slice(0, 40) || "avatar";
    const storedFileName = `${Date.now()}-${crypto.randomUUID()}-${safeBaseName}${extension}`;
    const storedPath = path.join(avatarUploadsDir, storedFileName);

    await fs.writeFile(storedPath, fileBuffer);

    res.json({
      avatar: `${req.protocol}://${req.get("host")}/uploads/avatars/${storedFileName}`
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to upload avatar" });
  }
});

// User endpoints
app.post("/api/users", async (req, res) => {
  try {
    const { username, nickname, avatar, birthday } = req.body;

    if (!username || !nickname) {
      return res.status(400).json({ error: "username and nickname are required" });
    }

    const user = await prisma.user.create({
      data: {
        username,
        nickname,
        avatar: avatar || null,
        birthday: birthday ? new Date(birthday) : null
      }
    });

    res.json(user);
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, nickname, avatar, birthday, password } = req.body;

    if (!username || !nickname || !password) {
      return res.status(400).json({ error: "username, nickname and password are required" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        nickname,
        avatar: avatar || null,
        birthday: birthday ? new Date(birthday) : null,
        password: hashed
      }
    });

    const token = signToken(user.id, user.username);
    const { password: _p, ...rest } = user as any;
    res.json({ ...rest, token });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Username already exists" });
    }
    res.status(500).json({ error: "Failed to register user" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatar: true,
        birthday: true,
        password: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user?.password) {
      return res.status(404).json({ error: "User not found or no password set" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "Invalid username and/or password" });

    const token = signToken(user.id, user.username);
    const { password: _p, ...rest } = user as any;
    res.json({ ...rest, token });
  } catch (error) {
    res.status(500).json({ error: "Failed to login" });
  }
});

app.get("/api/users/:username", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username }
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.get("/api/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.put("/api/users/:username", async (req, res) => {
  try {
    const { nickname, avatar, birthday } = req.body;
    const username = req.params.username;

    const user = await prisma.user.update({
      where: { username },
      data: {
        nickname: nickname !== undefined ? nickname : undefined,
        avatar: avatar !== undefined ? avatar : undefined,
        birthday: birthday ? new Date(birthday) : undefined
      }
    });

    res.json(user);
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/api/users/:username", async (req, res) => {
  try {
    await prisma.user.delete({
      where: { username: req.params.username }
    });

    res.json({ message: "User deleted successfully" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.post("/api/auth/verify", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    res.json({ valid: true, userId: decoded.userId, username: decoded.username });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.delete("/api/admin/users/:username", async (req, res) => {
  const authUser = getAuthenticatedUser(req);
  if (!authUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isAdminUsername(authUser.username)) {
    return res.status(403).json({ error: "Admin privileges required" });
  }

  const targetUsername = normalizeUsername(req.params.username);
  if (isAdminUsername(targetUsername)) {
    return res.status(403).json({ error: "Cannot delete admin account" });
  }

  try {
    const userToDelete = await prisma.user.findUnique({ where: { username: targetUsername } });
    if (!userToDelete) {
      return res.status(404).json({ error: "User not found" });
    }

    await prisma.$transaction(async (tx) => {
      const directChatIds = (await tx.directChat.findMany({
        where: {
          OR: [{ userA: userToDelete.id }, { userB: userToDelete.id }]
        },
        select: { id: true }
      })).map((chat: { id: string }) => chat.id);

      await tx.directMessage.deleteMany({ where: { authorId: userToDelete.id } });
      await tx.hiddenDirectChat.deleteMany({ where: { userId: userToDelete.id } });

      if (directChatIds.length > 0) {
        await tx.directMessage.deleteMany({ where: { chatId: { in: directChatIds } } });
        await tx.hiddenDirectChat.deleteMany({ where: { chatId: { in: directChatIds } } });
        await tx.directChat.deleteMany({ where: { id: { in: directChatIds } } });
      }

      await tx.user.delete({ where: { id: userToDelete.id } });
    });

    res.json({ message: "User removed by admin" });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Failed to remove user" });
  }
});

app.post("/api/direct-chats", async (req, res) => {
  try {
    const { participants } = req.body as { participants?: string[] };
    if (!participants || participants.length !== 2) {
      return res.status(400).json({ error: "participants must be an array of two usernames" });
    }

    const [firstUsername, secondUsername] = participants;
    if (firstUsername === secondUsername) {
      return res.status(400).json({ error: "Cannot create a direct chat with the same user" });
    }

    const userA = await prisma.user.findUnique({ where: { username: firstUsername } });
    const userB = await prisma.user.findUnique({ where: { username: secondUsername } });

    if (!userA || !userB) {
      return res.status(404).json({ error: "One or both participants were not found" });
    }

    const chat = await findOrCreateDirectChat(userA.id, userB.id);
    const room = buildDirectChatRoomName(chat.id);

    await hiddenDirectChats.deleteMany({
      where: { userId: userA.id, chatId: chat.id }
    });

    res.json({
      chatId: chat.id,
      room,
      participants: [
        {
          username: userA.username,
          nickname: userA.nickname,
          avatar: userA.avatar
        },
        {
          username: userB.username,
          nickname: userB.nickname,
          avatar: userB.avatar
        }
      ],
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt
    });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create or retrieve direct chat" });
  }
});

app.get("/api/users/:username/direct-chats", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true }
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const chats = await directChats.findMany({
      where: {
        OR: [{ userA: user.id }, { userB: user.id }],
        hiddenFor: { none: { userId: user.id } }
      },
      orderBy: { updatedAt: "desc" },
      include: {
        userAUser: { select: { id: true, username: true, nickname: true, avatar: true } },
        userBUser: { select: { id: true, username: true, nickname: true, avatar: true } }
      }
    }) as Array<DirectChat & { userAUser: { id: number; username: string; nickname: string; avatar: string | null }; userBUser: { id: number; username: string; nickname: string; avatar: string | null } }>;

    res.json(chats.map((chat) => {
      const otherUser = chat.userA === user.id ? chat.userBUser : chat.userAUser;
      return {
        chatId: chat.id,
        participant: {
          id: otherUser.id,
          username: otherUser.username,
          nickname: otherUser.nickname,
          avatar: otherUser.avatar
        },
        createdAt: chat.createdAt.toISOString(),
        updatedAt: chat.updatedAt.toISOString()
      };
    }));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch direct chats" });
  }
});

app.delete("/api/users/:username/direct-chats/:chatId", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: { id: true }
    });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const chat = await directChats.findUnique({
      where: { id: req.params.chatId }
    }) as DirectChat | null;
    if (!chat) {
      return res.status(404).json({ error: "Direct chat not found" });
    }

    if (chat.userA !== user.id && chat.userB !== user.id) {
      return res.status(403).json({ error: "Not a participant in this chat" });
    }

    await hiddenDirectChats.upsert({
      where: {
        userId_chatId: {
          userId: user.id,
          chatId: chat.id
        }
      },
      create: {
        userId: user.id,
        chatId: chat.id
      },
      update: {}
    });

    res.json({ message: "Direct chat removed from sidebar" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove direct chat" });
  }
});

app.get("/api/direct-chats/:chatId/messages", async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const chat = await directChats.findUnique({
      where: { id: chatId }
    }) as DirectChat | null;
    if (!chat) {
      return res.status(404).json({ error: "Direct chat not found" });
    }

    const directMessagesArray = await directMessages.findMany({
      where: { chatId },
      orderBy: { createdAt: "desc" },
      take: 100
    }) as DirectMessage[];
    const authorIds = Array.from(new Set(directMessagesArray.map((message: DirectMessage) => message.authorId))) as number[];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, username: true, nickname: true, avatar: true }
    });

    const authorsById = new Map(authors.map((author) => [author.id, author]));
    const serialized = directMessagesArray.reverse().map((message: DirectMessage) => {
      const author = authorsById.get(message.authorId);
      return serializeDirectMessage(message, {
        username: author?.username ?? "Unknown",
        nickname: author?.nickname ?? "Unknown",
        avatar: author?.avatar ?? null
      });
    });

    res.json(serialized);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch direct chat messages" });
  }
});

app.post("/api/direct-chats/:chatId/messages", async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const { authorUsername, content, id, createdAt } = req.body as {
      authorUsername?: string | null;
      content?: string;
      id?: string;
      createdAt?: string;
    };

    if (!chatId || !authorUsername || !content?.trim() || !id) {
      return res.status(400).json({ error: "chatId, authorUsername, id, and content are required" });
    }

    const chat = await directChats.findUnique({ where: { id: chatId } }) as DirectChat | null;
    if (!chat) {
      return res.status(404).json({ error: "Direct chat not found" });
    }

    const author = await prisma.user.findUnique({ where: { username: authorUsername } });
    if (!author) {
      return res.status(404).json({ error: "Author user not found" });
    }

    const savedMessage = await directMessages.create({
      data: {
        id,
        chatId,
        authorId: author.id,
        content: encryptMessageContent(content.trim()),
        createdAt: createdAt ? new Date(createdAt) : undefined
      }
    }) as DirectMessage;

    const outgoingMessage = serializeDirectMessage(savedMessage, {
      username: author.username,
      nickname: author.nickname,
      avatar: author.avatar
    });

    const roomName = buildDirectChatRoomName(chatId);
    io.to(roomName).emit("directMessage", outgoingMessage);
    res.json({ ok: true, message: outgoingMessage });
  } catch (error) {
    res.status(500).json({ error: "Failed to save direct chat message" });
  }
});

app.put("/api/direct-chats/:chatId/messages/:messageId", async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { content, authorUsername } = req.body as { content?: string; authorUsername?: string };

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const message = await directMessages.findUnique({
      where: { id: messageId }
    }) as DirectMessage | null;

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.chatId !== chatId) {
      return res.status(400).json({ error: "Message does not belong to this chat" });
    }

    const author = await prisma.user.findUnique({
      where: { username: authorUsername }
    });

    if (!author || author.id !== message.authorId) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    const updatedMessage = await directMessages.update({
      where: { id: messageId },
      data: {
        content: encryptMessageContent(content.trim())
      }
    }) as DirectMessage;

    const outgoingMessage = serializeDirectMessage(updatedMessage, {
      username: author.username,
      nickname: author.nickname,
      avatar: author.avatar
    });

    const roomName = buildDirectChatRoomName(chatId);
    io.to(roomName).emit("directMessageEdited", outgoingMessage);
    res.json({ ok: true, message: outgoingMessage });
  } catch (error) {
    res.status(500).json({ error: "Failed to edit direct message" });
  }
});

app.delete("/api/direct-chats/:chatId/messages/:messageId", async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const authenticatedUser = getAuthenticatedUser(req);

    if (!authenticatedUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const chat = await directChats.findUnique({ where: { id: chatId } }) as DirectChat | null;
    if (!chat) {
      return res.status(404).json({ error: "Direct chat not found" });
    }

    const message = await directMessages.findUnique({ where: { id: messageId } }) as DirectMessage | null;
    if (!message || message.chatId !== chatId) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.authorId !== authenticatedUser.userId) {
      return res.status(403).json({ error: "You can only delete your own messages" });
    }

    await directMessages.delete({ where: { id: messageId } });
    const roomName = buildDirectChatRoomName(chatId);
    io.to(roomName).emit("directMessageDeleted", { messageId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete direct message" });
  }
});

app.delete("/api/direct-chats/:chatId/messages", async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const chat = await directChats.findUnique({ where: { id: chatId } }) as DirectChat | null;
    if (!chat) {
      return res.status(404).json({ error: "Direct chat not found" });
    }

    await directMessages.deleteMany({ where: { chatId } });
    const roomName = buildDirectChatRoomName(chatId);
    io.to(roomName).emit("clearMessages");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear direct chat messages" });
  }
});

interface ChatMessage {
  id: string;
  author: string;
  authorUsername?: string | null;
  avatar?: string | null;
  content: string;
  createdAt: string;
  chatId?: string;
}

interface SavedMessage {
  id: string;
  room: string;
  author: string;
  authorUsername: string | null;
  avatar: string | null;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
}

type MessageModel = {
  findMany(args: {
    where: { room: string };
    orderBy: { createdAt: "asc" | "desc" };
    take: number;
  }): Promise<SavedMessage[]>;
  create(args: {
    data: {
      id: string;
      room: string;
      author: string;
      authorUsername?: string | null;
      avatar: string | null;
      content: string;
      createdAt?: Date;
    };
  }): Promise<SavedMessage>;
  update(args: {
    where: { id: string };
    data: {
      content?: string;
    };
  }): Promise<SavedMessage>;
  delete(args: {
    where: { id: string };
  }): Promise<SavedMessage>;
  findUnique(args: {
    where: { id: string };
  }): Promise<SavedMessage | null>;
  deleteMany(args: {
    where: { room: string };
  }): Promise<{ count: number }>;
};

const messages = (prisma as PrismaClient & { message: MessageModel }).message;
const directChats = (prisma as any).directChat;
const directMessages = (prisma as any).directMessage;
const hiddenDirectChats = (prisma as any).hiddenDirectChat;

type DirectChat = {
  id: string;
  userA: number;
  userB: number;
  createdAt: Date;
  updatedAt: Date;
};

type DirectMessage = {
  id: string;
  chatId: string;
  authorId: number;
  content: string;
  createdAt: Date;
  updatedAt?: Date;
};

type MessageAuthor = {
  username: string;
  nickname: string;
  avatar: string | null;
};

function buildDirectChatRoomName(chatId: string) {
  return `direct:${chatId}`;
}

async function findOrCreateDirectChat(userA: number, userB: number) {
  if (userA === userB) {
    throw new Error("Cannot create a direct chat with yourself");
  }

  const [first, second] = userA < userB ? [userA, userB] : [userB, userA];
  let chat = await directChats.findFirst({ where: { userA: first, userB: second } });
  if (!chat) {
    chat = await directChats.create({ data: { userA: first, userB: second } });
  }
  return chat as DirectChat;
}

function serializeDirectMessage(message: DirectMessage, author: MessageAuthor): ChatMessage {
  let content = message.content;
  try {
    content = decryptMessageContent(message.content);
  } catch (error) {
    content = "[Unable to decrypt message]";
  }

  return {
    id: message.id,
    author: author.nickname || author.username,
    authorUsername: author.username,
    avatar: author.avatar,
    content,
    createdAt: message.createdAt.toISOString(),
    chatId: message.chatId
  };
}

function getSyncedAvatar(message: SavedMessage, authors: MessageAuthor[]) {
  const author = authors.find((user) => {
    if (message.authorUsername && user.username === message.authorUsername) return true;
    return user.username === message.author || user.nickname === message.author;
  });

  return author?.avatar ?? message.avatar;
}

function serializeMessage(message: SavedMessage, authors: MessageAuthor[] = []): ChatMessage {
  let content = message.content;
  try {
    content = decryptMessageContent(message.content);
  } catch (error) {
    content = "[Unable to decrypt message]";
  }

  return {
    id: message.id,
    author: message.author,
    authorUsername: message.authorUsername,
    avatar: getSyncedAvatar(message, authors),
    content,
    createdAt: message.createdAt.toISOString()
  };
}

app.get("/api/rooms/:room/messages", async (req, res) => {
  try {
    const room = req.params.room;
    const roomMessages = await messages.findMany({
      where: { room },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    const roomAuthors = await prisma.user.findMany({
      select: { username: true, nickname: true, avatar: true }
    });

    res.json(roomMessages.reverse().map((message) => serializeMessage(message, roomAuthors)));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

app.put("/api/rooms/:room/messages/:messageId", async (req, res) => {
  try {
    const { room, messageId } = req.params;
    const { content, authorUsername } = req.body as { content?: string; authorUsername?: string };

    if (!content?.trim()) {
      return res.status(400).json({ error: "Message content is required" });
    }

    const message = await messages.findMany({
      where: { id: messageId, room }
    });

    if (!message.length) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (!authorUsername) {
      return res.status(400).json({ error: "authorUsername is required" });
    }

    const storedMessage = message[0];
    const isAuthor = authorUsername === storedMessage.authorUsername || authorUsername === storedMessage.author;

    if (!isAuthor) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    const updatedMessage = await messages.update({
      where: { id: messageId },
      data: {
        content: encryptMessageContent(content.trim())
      }
    });

    const outgoingMessage = serializeMessage(updatedMessage);
    io.to(room).emit("messageEdited", outgoingMessage);
    res.json({ ok: true, message: outgoingMessage });
  } catch (error) {
    res.status(500).json({ error: "Failed to edit message" });
  }
});

app.delete("/api/rooms/:room/messages/:messageId", async (req, res) => {
  try {
    const { room, messageId } = req.params;
    const authenticatedUser = getAuthenticatedUser(req);

    if (!authenticatedUser) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const message = await messages.findUnique({ where: { id: messageId } }) as SavedMessage | null;
    if (!message || message.room !== room) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.authorUsername !== authenticatedUser.username && message.author !== authenticatedUser.username) {
      return res.status(403).json({ error: "You can only delete your own messages" });
    }

    await messages.delete({ where: { id: messageId } });
    io.to(room).emit("messageDeleted", { messageId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});

app.delete("/api/rooms/:room/messages", async (req, res) => {
  try {
    const room = req.params.room;
    await messages.deleteMany({ where: { room } });
    io.to(room).emit("clearMessages");
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear messages" });
  }
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("joinRoom", (room: string) => {
    socket.join(room);
    console.log(`Client ${socket.id} joined room ${room}`);
  });

  socket.on("joinDirectChat", (chatId: string) => {
    const roomName = buildDirectChatRoomName(chatId);
    socket.join(roomName);
    console.log(`Client ${socket.id} joined direct chat ${chatId}`);
  });

  socket.on("directMessage", async (
    message: ChatMessage & { chatId: string },
    confirm?: (response: { ok: boolean; message?: ChatMessage; error?: string }) => void
  ) => {
    try {
      if (!message.chatId || !message.content?.trim() || !message.author?.trim()) {
        socket.emit("messageError", { error: "Invalid direct message" });
        confirm?.({ ok: false, error: "Invalid direct message" });
        return;
      }

      const chat = await directChats.findUnique({ where: { id: message.chatId } }) as DirectChat | null;
      if (!chat) {
        socket.emit("messageError", { error: "Direct chat not found" });
        confirm?.({ ok: false, error: "Direct chat not found" });
        return;
      }

      const author = await prisma.user.findUnique({ where: { username: message.authorUsername || message.author } });
      if (!author) {
        socket.emit("messageError", { error: "Author not found" });
        confirm?.({ ok: false, error: "Author not found" });
        return;
      }

      const savedMessage = await directMessages.create({
        data: {
          id: message.id,
          chatId: message.chatId,
          authorId: author.id,
          content: encryptMessageContent(message.content.trim()),
          createdAt: message.createdAt ? new Date(message.createdAt) : undefined
        }
      }) as DirectMessage;

      const outgoingMessage = serializeDirectMessage(savedMessage, {
        username: author.username,
        nickname: author.nickname,
        avatar: author.avatar
      });

      const roomName = buildDirectChatRoomName(message.chatId);
      io.to(roomName).emit("directMessage", outgoingMessage);
      confirm?.({ ok: true, message: outgoingMessage });
    } catch (error: any) {
      console.error("Failed to save direct message:", error);
      socket.emit("messageError", { error: "Failed to save direct message" });
      confirm?.({ ok: false, error: "Failed to save direct message" });
    }
  });

  socket.on("message", async (
    message: ChatMessage & { room: string },
    confirm?: (response: { ok: boolean; message?: ChatMessage; error?: string }) => void
  ) => {
    try {
      if (!message.room || !message.content?.trim() || !message.author?.trim()) {
        socket.emit("messageError", { error: "Invalid message" });
        confirm?.({ ok: false, error: "Invalid message" });
        return;
      }

      const savedMessage = await messages.create({
        data: {
          id: message.id,
          room: message.room,
          author: message.author.trim(),
          authorUsername: message.authorUsername || null,
          avatar: message.avatar || null,
          content: encryptMessageContent(message.content.trim()),
          createdAt: message.createdAt ? new Date(message.createdAt) : undefined
        }
      });

      const author = await prisma.user.findFirst({
        where: message.authorUsername
          ? { username: message.authorUsername }
          : { OR: [{ username: savedMessage.author }, { nickname: savedMessage.author }] },
        select: { username: true, nickname: true, avatar: true }
      });
      const outgoingMessage = serializeMessage(savedMessage, author ? [author] : []);
      io.to(message.room).emit("message", outgoingMessage);
      confirm?.({ ok: true, message: outgoingMessage });
    } catch (error: any) {
      console.error("Failed to save message:", error);
      socket.emit("messageError", { error: "Failed to save message" });
      confirm?.({ ok: false, error: "Failed to save message" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
