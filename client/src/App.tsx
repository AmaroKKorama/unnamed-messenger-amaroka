import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

interface ChatMessage {
  id: string;
  author: string;
  authorUsername?: string | null;
  avatar?: string | null;
  content: string;
  createdAt: string;
  room?: string;
  chatId?: string;
}

interface User {
  id: number;
  username: string;
  nickname: string;
  avatar?: string | null;
  birthday?: string | null;
  createdAt: string;
  updatedAt: string;
  token?: string;
}

interface ChatSession {
  id: string;
  name: string;
  room: string;
  messages: ChatMessage[];
  participantAvatar?: string | null;
}

const ROOM = "global-room";
const SERVER_URL = "http://localhost:4000";

type AuthState = {
  user: User | null;
  token: string | null;
};

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messagesById = new Map(current.map((message) => [message.id, message]));

  incoming.forEach((message) => {
    messagesById.set(message.id, message);
  });

  return Array.from(messagesById.values()).sort(
    (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read avatar file"));
    reader.readAsDataURL(file);
  });
}

const EMOJI_CATEGORY_ORDER = [
  "Recent",
  "Smileys & Emotion",
  "People & Body",
  "Animals & Nature",
  "Food & Drink",
  "Activities",
  "Travel & Places",
  "Objects",
  "Symbols",
];

const EMOJI_CATEGORY_LABELS: Record<string, string> = {
  Recent: "🕒",
  "Smileys & Emotion": "😊",
  "People & Body": "👨",
  "Animals & Nature": "🐱",
  "Food & Drink": "🍎",
  Activities: "🏈",
  "Travel & Places": "✈️",
  Objects: "💡",
  Symbols: "❤️",
};

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "Smileys & Emotion": [
    "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🥳", "😏", "😒", "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖", "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡", "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰", "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶", "😐", "😑", "😬", "🙄", "😯", "😦", "😧", "😮", "😲", "🥱", "😴", "🤤", "😪", "😵", "🤐", "🥴", "🤢", "🤮", "🤧", "😷", "🤒", "🤕", "🤑", "🤠"
  ],
  "People & Body": [
    "😈", "👿", "👹", "👺", "💀", "☠️", "👻", "👽", "👾", "🤖", "🎃", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "👋", "🤚", "🖐", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿", "🦶", "👂", "👃", "👣", "👀", "👁️", "👅", "👄", "💋", "🧠", "🫀", "🫁", "👤", "👥", "🧑‍🤝‍🧑", "🧑‍⚕️", "🧑‍🎓", "🧑‍🏫", "🧑‍⚖️", "🧑‍🌾", "🧑‍🍳", "🧑‍🔧", "🧑‍🏭", "🧑‍💼", "🧑‍🔬", "🧑‍💻", "🧑‍🎤", "🧑‍🎨", "🧑‍✈️", "🧑‍🚀", "🧑‍🚒", "👮‍♂️", "👮‍♀️", "🕵️‍♂️", "🕵️‍♀️", "💂‍♂️", "💂‍♀️", "👷‍♂️", "👷‍♀️", "🤴", "👸", "🕺", "💃", "🧘‍♂️", "🧘‍♀️", "🛀", "🛌", "👯‍♂️", "👯‍♀️", "💑", "👩‍❤️‍👨", "👩‍❤️‍👩", "👨‍❤️‍👨", "💏", "👨‍👩‍👧", "👨‍👩‍👧‍👦", "👩‍👩‍👧‍👦", "👨‍👨‍👧‍👦"
  ],
  "Animals & Nature": [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🦍", "🦧", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🪲", "🕷️", "🕸️", "🦂", "🐢", "🐍", "🦎", "🐙", "🐠", "🐟", "🐡", "🐬", "🐳", "🐋", "🦈", "🐊", "🐘", "🦛", "🦏", "🦣", "🐪", "🐫", "🦒", "🦘", "🦥", "🦨", "🦡", "🦦", "🐾", "🌸", "💐", "🌷", "🌹", "🥀", "🌺", "🌻", "🌼", "🌱", "🌲", "🌳", "🌴", "🌵", "🌾", "🌿", "☘️", "🍀", "🍃", "🍂", "🍁", "🌍", "🌎", "🌏", "🌐", "☀️", "🌤️", "⛅", "🌥️", "🌦️", "🌧️", "⛈️", "🌩️", "🌨️", "❄️", "🌬️", "💨", "🌪️", "🌫️", "🌊", "💧", "💦", "☔"
  ],
  "Food & Drink": [
    "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🫐", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🫑", "🌽", "🥕", "🥔", "🍠", "🧄", "🧅", "🥜", "🌰", "🍞", "🥐", "🥖", "🥨", "🥯", "🥞", "🧇", "🧈", "🧂", "🥩", "🍗", "🍖", "🌭", "🍔", "🍟", "🍕", "🫓", "🥪", "🥙", "🌮", "🌯", "🫔", "🥗", "🥘", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🥠", "🥡", "🍦", "🍧", "🍨", "🍩", "🍪", "🎂", "🍰", "🧁", "🥧", "🍫", "🍬", "🍭", "🍮", "🍯", "☕", "🍵", "🧃", "🥤", "🍷", "🍸", "🍹", "🍺", "🍻", "🥂", "🥃", "🧉", "🧊"
  ],
  Activities: [
    "⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🎱", "🪀", "🥏", "🏓", "🏸", "🥅", "🏒", "🏑", "🥍", "🏏", "⛳", "🪁", "🏹", "🎣", "🤿", "🏊‍♂️", "🏄‍♀️", "🚣‍♂️", "🧗‍♀️", "🚵‍♀️", "🚴‍♂️", "🎿", "⛷️", "🏂", "🪂", "🏋️‍♀️", "⛹️‍♀️", "🤺", "🤼‍♂️", "🤸‍♀️", "🤽‍♂️", "🤾‍♀️", "🤹‍♀️", "🎽", "🛼", "🛹", "🛶", "🧘‍♀️", "🧘‍♂️"
  ],
  "Travel & Places": [
    "🏍️", "🛵", "🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🛻", "🚚", "🚛", "🚜", "🛺", "🚲", "🛴", "🛹", "🛶", "✈️", "🛫", "🛬", "🛰️", "🚀", "🛸", "🛳️", "⛴️", "🛥️", "🚤", "⛵", "🚢", "⚓", "⛽", "🚏", "🗺️", "🗿", "🧭", "🗽", "🗼", "🏰", "🏯", "🏟️", "🏛️", "🏗️", "🏘️", "🏚️", "🏠", "🏡", "🏢", "🏬", "🏣", "🏤", "🏥", "🏦", "🏨", "🏪", "🏫", "🏩", "💒", "🕍", "⛪", "🕌", "🛕", "🕋", "⛲", "🏖️", "🏝️", "🏜️", "🏞️", "🌋", "🗻", "🏔️", "🏕️", "🛤️", "🛣️", "🌁", "🌃", "🌆", "🌇", "🌉", "🌌", "🌠", "🌈"
  ],
  Objects: [
    "🧵", "🧶", "🪡", "🪢", "🧷", "🧸", "🎎", "🧧", "🎏", "🎐", "🎌", "🏮", "🎭", "🎨", "🎬", "🎼", "🎵", "🎶", "🎤", "🎧", "🎹", "🥁", "🎷", "🎺", "🎸", "🎻", "🎲", "♟️", "🎯", "🧩", "🎮", "🕹️", "🎰", "🍽️", "🍴", "🥄", "⌚", "📱", "💻", "🖥️", "🖨️", "🖱️", "🖲️", "💽", "💾", "📀", "💿", "📼", "📷", "📸", "📹", "🎥", "📽️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "⏱️", "⏲️", "⏰", "⌛", "📡", "🔋", "🔌", "💡", "🔦", "🕯️", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "💰", "💳", "🧾", "💎", "⚖️", "🪙", "🧨", "🧧", "🧱", "🧲", "🧪", "🧫", "🧬", "🔬", "🔭", "📡"
  ],
  Symbols: [
    "🔮", "🪄", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "⛎", "🔀", "🔁", "🔂", "⏮", "⏭", "⏯", "⏱", "⏲", "⏳", "⌛", "🔚", "🔙", "🔛", "🔝", "🔜", "🔃", "🔄", "▶️", "⏩", "⏪", "🔼", "⏫", "🔽", "⏬", "⏸️", "⏹️", "⏺️", "🆗", "🆕", "🆙", "🆒", "🆓", "🆔", "🔠", "🔡", "🔢", "🔣", "🔤", "🈁", "🈂️", "🉐", "🈷️", "🈶", "🈯", "🈚", "🈸", "🈺", "🉑", "©️", "®️", "™️", "🔟", "🔢", "❌", "⭕", "✅", "☑️", "✔️", "✖️", "➕", "➖", "➗", "➰", "➿", "‼️", "⁉️", "❗", "❕", "❓", "❔", "💟", "💢", "💥", "💫", "💦", "💨", "🕳️", "💣", "💬", "🗨️", "🗯️", "💭", "💤", "♻️", "⚜️", "🔱", "📛", "🔰", "⚠️", "🚸", "💠", "⛔", "🚫", "🚳", "🚭", "🚯", "🚱", "🚷", "📵", "🔞", "☢️", "☣️", "♾️", "💮", "🉑", "🔘", "🔗", "🧿", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☦️", "🛐", "⛎"
  ],
};

function App() {
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const checkServer = useCallback(async () => {
    if (!online) return;

    try {
      const response = await fetch(`${SERVER_URL}/`);
      setServerOffline(!response.ok);
    } catch {
      setServerOffline(true);
    }
  }, [online]);

  const retryServerConnection = async () => {
    setServerOffline(false);
    await checkServer();
  };
  const [author, setAuthor] = useState("Guest");
  const [text, setText] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [currentEmojiCategory, setCurrentEmojiCategory] = useState("Smileys & Emotion");
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);
  const emojiContentRef = useRef<HTMLDivElement | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([
    { id: ROOM, name: "Global Room", room: ROOM, messages: [] }
  ]);
  const [currentChatId, setCurrentChatId] = useState(ROOM);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");
  const [view, setView] = useState<"welcome" | "login" | "register" | "chat">("welcome");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authUsername, setAuthUsername] = useState("");
  const [serverOffline, setServerOffline] = useState(false);
  const [authNickname, setAuthNickname] = useState("");
  const [authAvatar, setAuthAvatar] = useState("");
  const [directChatMenuOpen, setDirectChatMenuOpen] = useState(false);
  const [sidebarActionsOpen, setSidebarActionsOpen] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [directChatsLoaded, setDirectChatsLoaded] = useState(false);
  const [directChatLoading, setDirectChatLoading] = useState(false);
  const [directChatError, setDirectChatError] = useState("");
  const [directChatSuccess, setDirectChatSuccess] = useState("");
  const [directChatSearch, setDirectChatSearch] = useState("");
  const [clearHistorySuccess, setClearHistorySuccess] = useState("");
  const [authBirthday, setAuthBirthday] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authRepeat, setAuthRepeat] = useState("");
  const [authError, setAuthError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileAvatarUploading, setProfileAvatarUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");
  const [editingMessageChatId, setEditingMessageChatId] = useState<string | null>(null);

  // Clear the direct chat success message when the user performs any action
  useEffect(() => {
    if (!directChatSuccess) return;

    const clearSuccess = () => setDirectChatSuccess("");

    // Clear on next user interaction
    document.addEventListener("click", clearSuccess, { once: true });
    document.addEventListener("keydown", clearSuccess, { once: true });
    document.addEventListener("input", clearSuccess, { once: true });
    document.addEventListener("focusin", clearSuccess, { once: true });

    return () => {
      document.removeEventListener("click", clearSuccess);
      document.removeEventListener("keydown", clearSuccess);
      document.removeEventListener("input", clearSuccess);
      document.removeEventListener("focusin", clearSuccess);
    };
  }, [directChatSuccess]);

  useEffect(() => {
    if (!emojiPickerOpen) return;

    const closeEmojiPicker = (event: MouseEvent | KeyboardEvent) => {
      if (event.type === "mousedown") {
        const target = event.target as Node | null;
        if (emojiPickerRef.current?.contains(target)) {
          return;
        }
      }
      setEmojiPickerOpen(false);
    };

    document.addEventListener("mousedown", closeEmojiPicker);
    document.addEventListener("keydown", closeEmojiPicker);

    return () => {
      document.removeEventListener("mousedown", closeEmojiPicker);
      document.removeEventListener("keydown", closeEmojiPicker);
    };
  }, [emojiPickerOpen]);

  const scrollEmojiCategories = (offset: number) => {
    const content = emojiContentRef.current;
    if (!content) return;
    const speed = 2;
    content.scrollBy({ top: offset * speed, behavior: "smooth" });
  };

  const socketRef = useRef<Socket | null>(null);
  const joinedRoomRef = useRef<string | null>(null);
  const currentChatRef = useRef(currentChatId);
  const chatsRef = useRef(chats);
  const loadedChatsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    currentChatRef.current = currentChatId;
  }, [currentChatId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const getAvatarInitial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

  const GLOBAL_CHAT_AVATAR = "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/earth_lg.jpg";

  const getActiveChat = () => chats.find((chat) => chat.id === currentChatId) ?? chats[0];

  const getChatAvatar = (chat: ChatSession) => {
    if (chat.id === ROOM) {
      return GLOBAL_CHAT_AVATAR;
    }
    if (chat.participantAvatar) {
      return chat.participantAvatar;
    }
    if (!currentUser) return null;
    return chat.room.startsWith("direct") ? null : currentUser.avatar ?? null;
  };

  const updateMessagesWithCurrentAvatar = (username: string, nickname: string, avatar: string | null) => {
    setChats((currentChats) =>
      currentChats.map((chat) => ({
        ...chat,
        messages: chat.messages.map((message) => {
          if (
            message.authorUsername === username ||
            message.author === username ||
            message.author === nickname
          ) {
            return { ...message, avatar };
          }
          return message;
        })
      }))
    );
  };

  const updateChatMessages = (chatId: string, incoming: ChatMessage[]) => {
    setChats((currentChats) =>
      currentChats.map((chat) => {
        if (chat.id !== chatId) return chat;

        if (incoming.length === 0) {
          return { ...chat, messages: [] };
        }

        const messagesById = new Map(chat.messages.map((message) => [message.id, message]));
        incoming.forEach((message) => {
          messagesById.set(message.id, message);
        });
        const mergedMessages = Array.from(messagesById.values()).sort(
          (first, second) => new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
        );

        return { ...chat, messages: mergedMessages };
      })
    );
  };

  const removeChatMessage = (chatId: string, messageId: string) => {
    setChats((currentChats) =>
      currentChats.map((chat) =>
        chat.id !== chatId
          ? chat
          : { ...chat, messages: chat.messages.filter((message) => message.id !== messageId) }
      )
    );
  };

  const removeChat = async (chatId: string) => {
    const chat = chats.find((item) => item.id === chatId);
    if (!chat || chat.id === ROOM) return;
    if (!window.confirm("Remove this direct chat? This will delete it from your sidebar.")) {
      return;
    }

    if (!currentUser || !online) {
      setMessagesError("Cannot remove chat while offline");
      return;
    }

    try {
      const response = await fetch(
        `${SERVER_URL}/api/users/${encodeURIComponent(currentUser.username)}/direct-chats/${encodeURIComponent(chatId)}`,
        { method: "DELETE" }
      );
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to remove chat");
      }

      setChats((currentChats) => currentChats.filter((item) => item.id !== chatId));
      loadedChatsRef.current.delete(chatId);
      if (currentChatId === chatId) {
        setCurrentChatId(ROOM);
      }
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Failed to remove chat");
    }
  };

  const activeChat = getActiveChat();
  const activeMessages = activeChat.messages;

  const uploadAvatarFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      throw new Error("Please choose an image file");
    }

    const dataUrl = await readFileAsDataUrl(file);
    const response = await fetch(`${SERVER_URL}/api/uploads/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataUrl
      })
    });
    const data = await response.json();
      setServerOffline(false);
    if (!response.ok) {
      throw new Error(data.error || "Avatar upload failed");
    }

    return data.avatar as string;
  };

  const handleRegisterAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    setAuthError("");

    try {
      const avatar = await uploadAvatarFile(file);
      setAuthAvatar(avatar);
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
        setAuthError("Backend offline. Please start the server and retry.");
      } else {
        setAuthError(error.message || "Avatar upload failed");
      }
    } finally {
      setAvatarUploading(false);
      event.target.value = "";
    }
  };

  const handleProfileAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!online) {
      setMessagesError("Cannot upload avatar while offline");
      event.target.value = "";
      return;
    }

    const file = event.target.files?.[0];
    if (!file || !currentUser) return;

    setProfileAvatarUploading(true);
    setMessagesError("");

    try {
      const avatar = await uploadAvatarFile(file);
      const response = await fetch(`${SERVER_URL}/api/users/${encodeURIComponent(currentUser.username)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar })
      });
      const updatedUser = await response.json();

      if (!response.ok) {
        throw new Error(updatedUser.error || "Avatar update failed");
      }

      setCurrentUser(updatedUser);
      localStorage.setItem("auth", JSON.stringify({ user: updatedUser, token }));
      updateMessagesWithCurrentAvatar(updatedUser.username, updatedUser.nickname, updatedUser.avatar);
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Avatar update failed");
    } finally {
      setProfileAvatarUploading(false);
      event.target.value = "";
    }
  };

  const loadChatMessages = useCallback(async (chatId: string) => {
    const chat = chatsRef.current.find((item) => item.id === chatId);
    if (!chat) return;

    setMessagesLoading(true);
    setMessagesError("");

    if (!online) {
      setMessagesError("Cannot load messages while offline");
      setMessagesLoading(false);
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(chat.room)}/messages`);
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to load messages");
      }

      updateChatMessages(chatId, data);
      loadedChatsRef.current.add(chatId);
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Failed to load messages");
    } finally {
      setMessagesLoading(false);
    }
  }, [online]);

  const loadDirectChatMessages = useCallback(async (chatId: string) => {
    setMessagesLoading(true);
    setMessagesError("");

    if (!online) {
      setMessagesError("Cannot load messages while offline");
      setMessagesLoading(false);
      return;
    }

    try {
      const response = await fetch(`${SERVER_URL}/api/direct-chats/${encodeURIComponent(chatId)}/messages`);
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to load direct chat messages");
      }

      updateChatMessages(chatId, data);
      loadedChatsRef.current.add(chatId);
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Failed to load direct chat messages");
    } finally {
      setMessagesLoading(false);
    }
  }, [online]);

  const clearRoomMessages = async () => {
    const activeChat = getActiveChat();
    if (!online) {
      setMessagesError("Cannot clear history while offline");
      return;
    }

    if (!window.confirm("Clear all messages in this chat? This action cannot be undone.")) {
      return;
    }

    setMessagesError("");
    setClearHistorySuccess("");
    try {
      const endpoint = activeChat.room.startsWith("direct")
        ? `${SERVER_URL}/api/direct-chats/${encodeURIComponent(activeChat.id)}/messages`
        : `${SERVER_URL}/api/rooms/${encodeURIComponent(activeChat.room)}/messages`;

      const response = await fetch(endpoint, {
        method: "DELETE"
      });
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear messages");
      }

      updateChatMessages(activeChat.id, []);
      setClearHistorySuccess("Chat history deleted successfully.");
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Failed to clear messages");
    }
  };

  const createChat = (id: string, name: string, room: string, participantAvatar?: string | null) => {
    setChats((currentChats) => {
      const existing = currentChats.find((item) => item.id === id || item.room === room);
      if (existing) {
        return currentChats;
      }
      return [...currentChats, { id, name, room, participantAvatar, messages: [] }];
    });
    setCurrentChatId(id);

    if (room.startsWith("direct")) {
      loadDirectChatMessages(id);
    }

    if (socketRef.current?.connected && joinedRoomRef.current !== room) {
      if (room.startsWith("direct")) {
        socketRef.current.emit("joinDirectChat", id);
      } else {
        socketRef.current.emit("joinRoom", room);
      }
      joinedRoomRef.current = room;
    }
  };

  const changeChat = (chatId: string) => {
    const targetChat = chatsRef.current.find((chat) => chat.id === chatId);
    setCurrentChatId(chatId);

    if (targetChat?.room.startsWith("direct")) {
      loadDirectChatMessages(chatId);
    } else {
      loadChatMessages(chatId);
    }

    if (socketRef.current?.connected && targetChat && joinedRoomRef.current !== targetChat.room) {
      if (targetChat.room.startsWith("direct")) {
        socketRef.current.emit("joinDirectChat", targetChat.id);
      } else {
        socketRef.current.emit("joinRoom", targetChat.room);
      }
      joinedRoomRef.current = targetChat.room;
    }
  };

  const loadAvailableUsers = async () => {
    if (!currentUser) return;
    setDirectChatLoading(true);
    setDirectChatError("");

    try {
      const response = await fetch(`${SERVER_URL}/api/users`);
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to load accounts");
      }

      const users = (data as User[]).filter((user) => user.username !== currentUser.username);
      setAvailableUsers(users);
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
        setDirectChatError("Backend offline. Please start the server and retry.");
      } else {
        setDirectChatError(error.message || "Failed to load accounts");
      }
    } finally {
      setDirectChatLoading(false);
    }
  };

  const openDirectChatMenu = async () => {
    if (!currentUser) return;
    setDirectChatSuccess("");
    setDirectChatError("");
    setDirectChatSearch("");
    setDirectChatMenuOpen(true);

    if (availableUsers.length === 0) {
      await loadAvailableUsers();
    }
  };

  const closeDirectChatMenu = () => {
    setDirectChatMenuOpen(false);
    setDirectChatError("");
    setDirectChatSearch("");
  };

  const openSidebarActions = () => {
    setSidebarActionsOpen(true);
  };

  const closeSidebarActions = () => {
    setSidebarActionsOpen(false);
  };

  const openDirectChatFromActions = () => {
    closeSidebarActions();
    openDirectChatMenu();
  };

  const directChatSearchLower = directChatSearch.toLowerCase();
  const filteredAvailableUsers = availableUsers.filter((user) =>
    user.username.toLowerCase().includes(directChatSearchLower) ||
    user.nickname.toLowerCase().includes(directChatSearchLower)
  );

  const logoutFromActions = () => {
    closeSidebarActions();
    handleLogout();
  };

  const clearHistoryFromActions = () => {
    closeSidebarActions();
    clearRoomMessages();
  };

  const removeCurrentChatFromActions = () => {
    closeSidebarActions();
    removeChat(currentChatId);
  };

  const deleteAccountFromActions = () => {
    closeSidebarActions();
    handleDeleteAccount();
  };

  const loadUserDirectChats = useCallback(async () => {
    if (!currentUser || !online) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/users/${encodeURIComponent(currentUser.username)}/direct-chats`);
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to load direct chats");
      }

      setChats((currentChats) => {
        const globalChat = currentChats.find((chat) => chat.id === ROOM) ?? {
          id: ROOM,
          name: "Global Room",
          room: ROOM,
          messages: [] as ChatMessage[]
        };

        const currentChatMap = new Map(currentChats.map((chat) => [chat.id, chat]));
        const directChats = (data as Array<{
          chatId: string;
          participant: { username: string; nickname: string; avatar: string | null };
        }>).map((directChat) => ({
          id: directChat.chatId,
          name: `Chat with ${directChat.participant.nickname || directChat.participant.username}`,
          room: `direct:${directChat.chatId}`,
          participantAvatar: directChat.participant.avatar,
          messages: currentChatMap.get(directChat.chatId)?.messages ?? []
        }));

        return [globalChat, ...directChats];
      });
      setDirectChatsLoaded(true);
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
    }
  }, [currentUser, online]);

  const createDirectChat = async (user: User) => {
    if (!currentUser) return;
    setDirectChatLoading(true);
    setDirectChatError("");

    try {
      const response = await fetch(`${SERVER_URL}/api/direct-chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participants: [currentUser.username, user.username] })
      });
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Could not create direct chat");
      }

      const directChatId = data.chatId;
      const directChatRoom = data.room ?? `direct:${directChatId}`;
      const directChatName = `Chat with ${user.nickname || user.username}`;
      createChat(directChatId, directChatName, directChatRoom, user.avatar);

      setDirectChatSuccess(`Direct chat with ${user.nickname || user.username} is ready.`);
      closeDirectChatMenu();
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
        setDirectChatError("Backend offline. Please start the server and retry.");
      } else {
        setDirectChatError(error.message || "Failed to create direct chat");
      }
    } finally {
      setDirectChatLoading(false);
    }
  };

  useEffect(() => {
    const instance = io(SERVER_URL);
    socketRef.current = instance;

    const handleConnect = () => {
      setConnected(true);
      setServerOffline(false);
      const activeChatId = currentChatRef.current;
      const activeChat = chatsRef.current.find((chat) => chat.id === activeChatId);
      const activeRoom = activeChat?.room ?? ROOM;
      if (joinedRoomRef.current !== activeRoom) {
        if (activeChat?.room.startsWith("direct")) {
          instance.emit("joinDirectChat", activeChatId);
        } else {
          instance.emit("joinRoom", activeRoom);
        }
        joinedRoomRef.current = activeRoom;
      }
      if (activeChat?.room.startsWith("direct")) {
        loadDirectChatMessages(activeChatId);
      } else {
        loadChatMessages(activeChatId);
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
      joinedRoomRef.current = null;
    };

    const handleConnectError = () => {
      setConnected(false);
      setServerOffline(true);
    };

    const handleMessage = (message: ChatMessage) => {
      const targetRoom = message.room ?? chatsRef.current.find((chat) => chat.id === currentChatRef.current)?.room ?? ROOM;
      const targetChat = chatsRef.current.find((chat) => chat.room === targetRoom) ?? chatsRef.current[0];
      updateChatMessages(targetChat.id, [message]);
    };

    const handleDirectMessage = (message: ChatMessage) => {
      if (message.chatId) {
        updateChatMessages(message.chatId, [message]);
      }
    };

    const handleMessageError = (payload: { error?: string }) => {
      setMessagesError(payload.error || "Message was not saved");
    };

    const handleClearMessages = () => {
      updateChatMessages(currentChatRef.current, []);
    };

    const handleMessageDeleted = (payload: { messageId: string }) => {
      const targetChat = chatsRef.current.find((chat) => !chat.room.startsWith("direct"));
      if (targetChat) {
        removeChatMessage(targetChat.id, payload.messageId);
      }
    };

    const handleDirectMessageDeleted = (payload: { messageId: string }) => {
      const targetChat = chatsRef.current.find((chat) => chat.room.startsWith("direct"));
      if (targetChat) {
        removeChatMessage(targetChat.id, payload.messageId);
      }
    };

    instance.on("connect", handleConnect);
    instance.on("disconnect", handleDisconnect);
    instance.on("connect_error", handleConnectError);
    instance.on("message", handleMessage);
    instance.on("directMessage", handleDirectMessage);
    instance.on("messageError", handleMessageError);
    instance.on("clearMessages", handleClearMessages);
    instance.on("messageDeleted", handleMessageDeleted);
    instance.on("directMessageDeleted", handleDirectMessageDeleted);

    return () => {
      instance.off("connect", handleConnect);
      instance.off("disconnect", handleDisconnect);
      instance.off("connect_error", handleConnectError);
      instance.off("message", handleMessage);
      instance.off("directMessage", handleDirectMessage);
      instance.off("messageError", handleMessageError);
      instance.off("clearMessages", handleClearMessages);
      instance.off("messageDeleted", handleMessageDeleted);
      instance.off("directMessageDeleted", handleDirectMessageDeleted);
      instance.disconnect();
      if (socketRef.current === instance) socketRef.current = null;
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    if (view !== "chat") return;
    if (!online) return;
    if (messagesLoading) return;

    const targetChat = chatsRef.current.find((chat) => chat.id === currentChatId);
    if (!targetChat) return;
    if (loadedChatsRef.current.has(currentChatId)) return;

    if (targetChat.room.startsWith("direct")) {
      loadDirectChatMessages(currentChatId);
    } else {
      loadChatMessages(currentChatId);
    }
  }, [view, online, currentChatId, messagesLoading]);

  useEffect(() => {
    if (view !== "chat" || !currentUser || directChatsLoaded) return;
    loadUserDirectChats();
  }, [view, currentUser, directChatsLoaded, loadUserDirectChats]);

  // Restore auth state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("auth");
    if (stored) {
      try {
        const { user, token } = JSON.parse(stored) as AuthState;
        if (token && user) {
          setCurrentUser(user);
          setToken(token);
          setAuthor(user.nickname || user.username);
          setView("chat");
          loadChatMessages(currentChatId);
        }
      } catch (err) {
        // Invalid stored data, clear it
        localStorage.removeItem("auth");
      }
    }
  }, [currentChatId]);

  const sendMessage = () => {
    const socket = socketRef.current;
    if (!text.trim()) return;

    if (!online) {
      setMessagesError("Cannot send while offline");
      return;
    }

    if (!socket?.connected) {
      setMessagesError("Cannot send while disconnected");
      setConnected(false);
      return;
    }

    const isDirectChat = activeChat.room.startsWith("direct");
    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author: author || "Guest",
      authorUsername: currentUser?.username || null,
      avatar: currentUser?.avatar || null,
      content: text.trim(),
      createdAt: new Date().toISOString(),
      ...(isDirectChat ? { chatId: activeChat.id } : { room: activeChat.room })
    };

    updateChatMessages(activeChat.id, [message]);
    setMessagesError("");

    const eventName = isDirectChat ? "directMessage" : "message";
    const eventPayload = isDirectChat
      ? { ...message, chatId: activeChat.id }
      : { ...message, room: activeChat.room };

    socket.timeout(5000).emit(
      eventName,
      eventPayload,
      (error: Error | null, response?: { ok: boolean; message?: ChatMessage; error?: string }) => {
        if (error) {
          removeChatMessage(activeChat.id, message.id);
          setMessagesError("Message was not saved. Connection timed out.");
          return;
        }

        const confirmedMessage = response?.message;
        if (response?.ok && confirmedMessage) {
          updateChatMessages(activeChat.id, [confirmedMessage]);
          return;
        }

        removeChatMessage(activeChat.id, message.id);
        setMessagesError(response?.error || "Message was not saved");
      }
    );
    setText("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter") {
      if (event.shiftKey) {
        return;
      } else {
        event.preventDefault();
        sendMessage();
      }
    }
  };

  const resetAuthForm = () => {
    setAuthError("");
    setAuthUsername("");
    setAuthNickname("");
    setAuthAvatar("");
    setAuthBirthday("");
    setAuthPassword("");
    setAuthRepeat("");
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    if (!authPassword) {
      setAuthError("Password is required");
      return;
    }

    if (authPassword !== authRepeat) {
      setAuthError("Passwords do not match");
      return;
    }

      try {
        const response = await fetch(`${SERVER_URL}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: authUsername.trim(),
            nickname: authNickname.trim(),
            avatar: authAvatar.trim() || undefined,
            birthday: authBirthday || undefined,
            password: authPassword
          })
        });

        const data = await response.json();
        setServerOffline(false);
        if (!response.ok) {
          setAuthError(data.error || "Registration failed");
          return;
        }

        const { token: newToken, ...userInfo } = data;
        setCurrentUser(userInfo);
        setToken(newToken);
        setAuthor(userInfo.nickname || userInfo.username);
        localStorage.setItem("auth", JSON.stringify({ user: userInfo, token: newToken }));
        resetAuthForm();
        setView("chat");
        loadChatMessages(currentChatId);
      } catch (error: any) {
        if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
          setServerOffline(true);
          setAuthError("Backend offline. Please start the server and retry.");
        } else {
          setAuthError(error.message || "Registration failed");
        }
      }
    };

    const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAuthError("");

      try {
        const response = await fetch(`${SERVER_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: authUsername.trim(), password: authPassword })
        });

        const data = await response.json();
        setServerOffline(false);
        if (!response.ok) {
          setAuthError(data.error || "Login failed");
          return;
        }

        const { token: newToken, ...userInfo } = data;
        setCurrentUser(userInfo);
        setToken(newToken);
        setAuthor(userInfo.nickname || userInfo.username);
        localStorage.setItem("auth", JSON.stringify({ user: userInfo, token: newToken }));
        resetAuthForm();
        setView("chat");
        loadChatMessages(currentChatId);
      } catch (error: any) {
        if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
          setServerOffline(true);
          setAuthError("Backend offline. Please start the server and retry.");
        } else {
          setAuthError(error.message || "Login failed");
        }
      }
    };

  const handleLogout = () => {
    setCurrentUser(null);
    setToken(null);
    setAuthor("Guest");
    setView("welcome");
    setChats([{ id: ROOM, name: "Global Room", room: ROOM, messages: [] }]);
    setCurrentChatId(ROOM);
    setDirectChatsLoaded(false);
    loadedChatsRef.current.clear();
    localStorage.removeItem("auth");
  };

  const handleDeleteAccount = async () => {
    if (!currentUser) return;
    if (!window.confirm("Delete your account and all associated data? This cannot be undone.")) {
      return;
    }

    setMessagesError("");
    try {
      const response = await fetch(`${SERVER_URL}/api/users/${encodeURIComponent(currentUser.username)}`, {
        method: "DELETE"
      });
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      handleLogout();
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Failed to delete account");
    }
  };

  const handleAdminDeleteAccount = async () => {
    if (!currentUser || !token) return;
    const target = window.prompt("Enter the username to delete (with or without @):");
    if (!target?.trim()) return;

    const targetUsername = target.trim().replace(/^@/, "");
    if (targetUsername.toLowerCase() === currentUser.username.replace(/^@/, "").toLowerCase()) {
      window.alert("You cannot delete your own admin account here.");
      return;
    }

    setMessagesError("");
    try {
      const response = await fetch(`${SERVER_URL}/api/admin/users/${encodeURIComponent(targetUsername)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await response.json();

      setServerOffline(false);
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete user account");
      }

      window.alert("User account deleted successfully.");
    } catch (error: any) {
      if (error instanceof TypeError || String(error).includes("Failed to fetch")) {
        setServerOffline(true);
      }
      setMessagesError(error.message || "Failed to delete user account");
    }
  };

  const editDirectMessage = async (chatId: string, messageId: string, newContent: string) => {
    if (!currentUser || !newContent.trim()) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/direct-chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent.trim(), authorUsername: currentUser.username })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to edit message");
      }

      const updatedChat = chats.find((c) => c.id === chatId);
      if (updatedChat) {
        updatedChat.messages = updatedChat.messages.map((msg) =>
          msg.id === messageId ? { ...msg, content: newContent.trim() } : msg
        );
        setChats([...chats]);
      }

      setEditingMessageId(null);
      setEditingMessageText("");
      setEditingMessageChatId(null);
    } catch (error: any) {
      setMessagesError(error.message || "Failed to edit message");
    }
  };

  const editRoomMessage = async (room: string, messageId: string, newContent: string) => {
    if (!currentUser || !newContent.trim()) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(room)}/messages/${encodeURIComponent(messageId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent.trim(), authorUsername: currentUser.username })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to edit message");
      }

      const updatedChat = chats.find((c) => c.room === room);
      if (updatedChat) {
        updatedChat.messages = updatedChat.messages.map((msg) =>
          msg.id === messageId ? { ...msg, content: newContent.trim() } : msg
        );
        setChats([...chats]);
      }

      setEditingMessageId(null);
      setEditingMessageText("");
      setEditingMessageChatId(null);
    } catch (error: any) {
      setMessagesError(error.message || "Failed to edit message");
    }
  };

  const deleteDirectMessage = async (chatId: string, messageId: string) => {
    if (!currentUser) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/direct-chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete message");
      }

      removeChatMessage(chatId, messageId);
    } catch (error: any) {
      setMessagesError(error.message || "Failed to delete message");
    }
  };

  const deleteRoomMessage = async (room: string, messageId: string) => {
    if (!currentUser) return;

    try {
      const response = await fetch(`${SERVER_URL}/api/rooms/${encodeURIComponent(room)}/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete message");
      }

      const chat = chats.find((c) => c.room === room);
      if (chat) {
        removeChatMessage(chat.id, messageId);
      }
    } catch (error: any) {
      setMessagesError(error.message || "Failed to delete message");
    }
  };

  const startEditMessage = (messageId: string, currentContent: string, chatId?: string) => {
    setEditingMessageId(messageId);
    setEditingMessageText(currentContent);
    setEditingMessageChatId(chatId ?? null);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingMessageText("");
    setEditingMessageChatId(null);
  };

  const currentUsername = currentUser?.username ?? "";
  const isAdminUser = currentUsername.replace(/^@/, "").toLowerCase() === "admin";

  if (view !== "chat") {
    return (
      <div className="auth-screen">
        <div className="auth-brand">
          <h1>Messenger</h1>
          <p>Connect with friends in real time</p>
        </div>

        {serverOffline && online ? (
          <div className="auth-card offline-panel">
            <h2>Backend offline</h2>
            <p>We cannot reach the backend server at {SERVER_URL} right now.</p>
            <p>Please make sure the backend is running and then retry.</p>
            <div className="button-row">
              <button type="button" className="auth-button-primary" onClick={retryServerConnection}>
                Retry connection
              </button>
            </div>
          </div>
        ) : (
          <div className={`auth-card${view === "register" ? " auth-card-wide" : ""}`}>
            {view === "welcome" && (
              <div className="welcome-panel">
                <h2>Welcome</h2>
                <p>Register a new account or log in to an existing one.</p>
                <div className="button-row">
                  <button
                    type="button"
                    className="auth-button-primary"
                    onClick={() => { resetAuthForm(); setView("register"); }}
                  >
                    Register Account
                  </button>
                  <button
                    type="button"
                    className="auth-button-secondary"
                    onClick={() => { resetAuthForm(); setView("login"); }}
                  >
                    Login
                  </button>
                </div>
              </div>
            )}

            {view === "register" && (
              <form className="auth-form" onSubmit={handleRegister}>
                <h2>Register</h2>
                <label>
                  Username
                  <input
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    placeholder="Enter username"
                  />
                </label>
                <label>
                  Nickname
                  <input
                    value={authNickname}
                    onChange={(event) => setAuthNickname(event.target.value)}
                    placeholder="Enter display name"
                  />
                </label>
                <label>
                  Avatar URL
                  <input
                    value={authAvatar}
                    onChange={(event) => setAuthAvatar(event.target.value)}
                    placeholder="Optional avatar URL or upload below"
                  />
                </label>
                <label className="file-button auth-file-button">
                  {avatarUploading ? "Uploading..." : "Upload avatar picture"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleRegisterAvatarChange}
                    disabled={avatarUploading}
                  />
                </label>
                {authAvatar && (
                  <div className="avatar-preview">
                    <div className="message-avatar" aria-hidden="true">
                      <img src={authAvatar} alt="" />
                    </div>
                    <span>{avatarUploading ? "Uploading..." : "Avatar ready"}</span>
                  </div>
                )}
                <label>
                  Birthday
                  <input
                    type="date"
                    value={authBirthday}
                    onChange={(event) => setAuthBirthday(event.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Enter password"
                  />
                </label>
                <label>
                  Repeat Password
                  <input
                    type="password"
                    value={authRepeat}
                    onChange={(event) => setAuthRepeat(event.target.value)}
                    placeholder="Repeat password"
                  />
                </label>
                {authError && <p className="error-message">{authError}</p>}
                <div className="auth-actions">
                  <button type="submit" className="auth-button-primary">Create Account</button>
                  <button type="button" className="auth-button-secondary" onClick={() => setView("welcome")}>
                    Back
                  </button>
                </div>
                <p className="auth-link">
                  Already have an account?{" "}
                  <button type="button" onClick={() => { resetAuthForm(); setView("login"); }}>
                    Log in
                  </button>
                </p>
              </form>
            )}

            {view === "login" && (
              <form className="auth-form" onSubmit={handleLogin}>
                <h2>Login</h2>
                <label>
                  Username
                  <input
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    placeholder="Enter username"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Enter password"
                  />
                </label>
                {authError && <p className="error-message">{authError}</p>}
                <div className="auth-actions">
                  <button type="submit" className="auth-button-primary">Login</button>
                  <button type="button" className="auth-button-secondary" onClick={() => setView("welcome")}>
                    Back
                  </button>
                </div>
                <p className="auth-link">
                  Don&apos;t have an account?{" "}
                  <button type="button" onClick={() => { resetAuthForm(); setView("register"); }}>
                    Register
                  </button>
                </p>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>Messenger</h1>
        <p className={online && connected ? "status connected" : "status disconnected"}>
          {online ? (connected ? "Connected online" : "Online — connecting...") : "Offline"}
        </p>

        <div className="chat-list">
          {chats.map((chat) => {
            const avatarUrl = getChatAvatar(chat);
            return (
              <button
                key={chat.id}
                type="button"
                className={chat.id === currentChatId ? "chat-item active" : "chat-item"}
                onClick={() => changeChat(chat.id)}
              >
                <div className="chat-item-avatar" aria-hidden="true">
                  {avatarUrl ? <img src={avatarUrl} alt="" /> : <span>{getAvatarInitial(chat.name)}</span>}
                </div>
                <div className="chat-item-info">
                  <span>{chat.name}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="sidebar-bottom">
          {directChatSuccess && (
            <p className="success-message" style={{ marginBottom: "0.5rem" }}>{directChatSuccess}</p>
          )}

          <div className="profile-avatar">
            <div className="message-avatar" aria-hidden="true">
              {currentUser?.avatar ? (
                <img src={currentUser.avatar} alt="" />
              ) : (
                <span>{getAvatarInitial(currentUser?.nickname || currentUser?.username || "User")}</span>
              )}
            </div>
          </div>
          <button className="file-button settings-button" onClick={openSidebarActions}>
            ⚙️
          </button>
          <button
            className="file-button add-chat-button"
            onClick={openDirectChatFromActions}
            disabled={!online || !currentUser}
            title="Create direct chat"
            aria-label="Create direct chat"
          >
            +
          </button>
        </div>
      </aside>
      <div className="divider" />

      <main className={`chat-panel${directChatMenuOpen || sidebarActionsOpen ? " direct-chat-active" : ""}`}>
        {directChatMenuOpen && (
          <div className="direct-chat-modal">
            <div className="direct-chat-card">
              <div className="modal-header">
                <h2>Select an account</h2>
                <button className="close-button" onClick={closeDirectChatMenu}>×</button>
              </div>
              <p>Choose another account to create a direct chat.</p>
              <div className="direct-chat-search">
                <input
                  type="search"
                  value={directChatSearch}
                  onChange={(event) => setDirectChatSearch(event.target.value)}
                  placeholder="Search by name or username"
                  aria-label="Search users"
                />
              </div>
              {directChatError && <p className="error-message">{directChatError}</p>}
              <div className="direct-chat-list">
                {directChatLoading && <p>Loading accounts...</p>}
                {!directChatLoading && filteredAvailableUsers.length === 0 && (
                  <p>{directChatSearch.trim() ? "No matching accounts found." : "No other accounts available."}</p>
                )}
                {!directChatLoading && filteredAvailableUsers.map((user) => (
                  <button
                    key={user.username}
                    className="direct-chat-item"
                    onClick={() => createDirectChat(user)}
                    disabled={directChatLoading}
                  >
                    <div className="direct-chat-item-avatar" aria-hidden="true">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" />
                      ) : (
                        <span>{getAvatarInitial(user.nickname || user.username)}</span>
                      )}
                    </div>
                    <div>
                      <span>{user.nickname || user.username}</span>
                      <small>@{user.username}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {sidebarActionsOpen && (
          <div className="sidebar-actions-modal">
            <div className="sidebar-actions-card">
              <div className="modal-header">
                <h2>Settings</h2>
                <button className="close-button" onClick={closeSidebarActions}>×</button>
              </div>
              <div className="sidebar-actions-list">
                <label className="file-button">
                  {profileAvatarUploading ? "Uploading..." : "Upload avatar"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleProfileAvatarChange}
                    disabled={profileAvatarUploading}
                  />
                </label>
                <button className="file-button danger-button" onClick={clearHistoryFromActions} disabled={!online}>Clear chat history</button>
                {isAdminUser && (
                  <button
                    className="file-button danger-button"
                    onClick={handleAdminDeleteAccount}
                    disabled={!online}
                  >
                    Delete user account
                  </button>
                )}
                <button className="file-button danger-button" onClick={removeCurrentChatFromActions} disabled={!online || currentChatId === ROOM}>
                  Remove chat
                </button>
                <button className="file-button danger-button" onClick={logoutFromActions} disabled={!online}>
                  Log out
                </button>
                <button className="file-button danger-button" onClick={deleteAccountFromActions} disabled={!online || !currentUser}>
                  Delete account
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="chat-topbar">
          <h2>{getActiveChat().name}</h2>
        </div>
        <div className="chat-window">
          <div className="message-list">
            {messagesLoading && <p className="message-state">Loading saved messages...</p>}
            {messagesError && <p className="message-state error-message">{messagesError}</p>}
            {clearHistorySuccess && <p className="message-state success-message">{clearHistorySuccess}</p>}
            {!messagesLoading && activeMessages.length === 0 && !clearHistorySuccess && (
              <p className="message-state">No messages yet.</p>
            )}
            {activeMessages.map((message) => {
              const isAuthor = currentUser?.username === message.authorUsername || currentUser?.nickname === message.author || currentUser?.username === message.author;
              const isDirectChat = activeChat.room.startsWith("direct");
              const isEditing = editingMessageId === message.id;
              return (
                <article key={message.id} className="message-card" title={isAuthor ? "Hover to edit or delete" : ""}>
                  <div className="message-avatar" aria-hidden="true">
                    {message.avatar ? (
                      <img src={message.avatar} alt="" />
                    ) : (
                      <span>{getAvatarInitial(message.author)}</span>
                    )}
                  </div>
                  <div className="message-body">
                    <strong>{message.author}</strong>
                    {isEditing ? (
                      <div className="message-edit-container">
                        <textarea
                          className="message-edit-input"
                          value={editingMessageText}
                          onChange={(e) => setEditingMessageText(e.target.value)}
                          autoFocus
                        />
                        <div className="message-edit-actions">
                          <button
                            className="message-edit-save"
                            onClick={() => {
                              if (isDirectChat && message.chatId) {
                                editDirectMessage(message.chatId, message.id, editingMessageText);
                              } else if (!isDirectChat) {
                                editRoomMessage(activeChat.room, message.id, editingMessageText);
                              }
                            }}
                            disabled={!editingMessageText.trim()}
                          >
                            Save
                          </button>
                          <button className="message-edit-cancel" onClick={cancelEditMessage}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p>{message.content}</p>
                        <time>{new Date(message.createdAt).toLocaleTimeString()}</time>
                      </>
                    )}
                  </div>
                  {isAuthor && !isEditing && (
                    <div className="message-actions">
                      <button
                        className="message-edit-btn"
                        onClick={() => startEditMessage(message.id, message.content, isDirectChat ? message.chatId : undefined)}
                        title="Edit message"
                      >
                        ✎
                      </button>
                      <button
                        className="message-delete-btn"
                        onClick={() => {
                          if (window.confirm("Delete this message?")) {
                            if (isDirectChat && message.chatId) {
                              deleteDirectMessage(message.chatId, message.id);
                            } else if (!isDirectChat) {
                              deleteRoomMessage(activeChat.room, message.id);
                            }
                          }
                        }}
                        title="Delete message"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>

        <div className="composer">
          <textarea
            ref={textAreaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message"
            disabled={!online}
          />
          <div className="emoji-picker-wrapper" ref={emojiPickerRef}>
            <button
              type="button"
              className="emoji-button"
              onClick={() => setEmojiPickerOpen((open) => !open)}
              aria-label="Choose emoji"
            >
              😊
            </button>
            {emojiPickerOpen && (
              <div className="emoji-picker" role="menu">
                <div
                  className="emoji-picker-content"
                  ref={emojiContentRef}
                  onWheel={(event) => {
                    event.preventDefault();
                    scrollEmojiCategories(event.deltaY);
                  }}
                >
                  {((currentEmojiCategory === "Recent" ? recentEmojis : EMOJI_CATEGORIES[currentEmojiCategory]) || []).length === 0 ? (
                    <div className="emoji-picker-empty">No recent emojis yet. Select one to add it here.</div>
                  ) : (
                    (currentEmojiCategory === "Recent" ? recentEmojis : EMOJI_CATEGORIES[currentEmojiCategory] || []).map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        className="emoji-picker-item"
                        onClick={() => {
                          const input = textAreaRef.current;
                          if (!input) return;
                          const start = input.selectionStart ?? text.length;
                          const end = input.selectionEnd ?? text.length;
                          const nextText = text.slice(0, start) + emoji + text.slice(end);
                          setText(nextText);
                          setRecentEmojis((previous) => [emoji, ...previous.filter((item) => item !== emoji)].slice(0, 24));
                          requestAnimationFrame(() => {
                            input.focus();
                            const caret = start + emoji.length;
                            input.setSelectionRange(caret, caret);
                          });
                        }}
                      >
                        {emoji}
                      </button>
                    ))
                  )}
                </div>
                <div className="emoji-picker-bottom" role="tablist">
                  {EMOJI_CATEGORY_ORDER.map((category) => (
                    <button
                      type="button"
                      key={category}
                      className={`emoji-category-btn ${currentEmojiCategory === category ? "active" : ""}`}
                      onClick={() => setCurrentEmojiCategory(category)}
                    >
                      {EMOJI_CATEGORY_LABELS[category]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={sendMessage} disabled={!online || !connected}>
            {online ? "Send" : "Offline"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;
