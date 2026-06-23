# User Database API

The messenger app now includes a SQLite database (via Prisma ORM) for managing user profiles.

## User Schema

Each user has:
- `id` - Auto-increment integer (primary key)
- `username` - Unique string identifier
- `nickname` - Display name shown in chat
- `avatar` - Optional URL to user avatar image
- `birthday` - Optional date of birth
- `createdAt` - Timestamp of user creation
- `updatedAt` - Timestamp of last update

## API Endpoints

### Create a User
**POST** `/api/users`

Request body:
```json
{
  "username": "john_doe",
  "nickname": "John",
  "avatar": "https://example.com/avatar.jpg",
  "birthday": "1990-05-15"
}
```

Response:
```json
{
  "id": 1,
  "username": "john_doe",
  "nickname": "John",
  "avatar": "https://example.com/avatar.jpg",
  "birthday": "1990-05-15T00:00:00.000Z",
  "createdAt": "2026-06-21T16:37:18.000Z",
  "updatedAt": "2026-06-21T16:37:18.000Z"
}
```

### Get All Users
**GET** `/api/users`

Returns array of all users.

### Get User by Username
**GET** `/api/users/:username`

Returns a single user profile.

### Update a User
**PUT** `/api/users/:username`

Request body (all fields optional):
```json
{
  "nickname": "Johnny",
  "avatar": "https://example.com/new-avatar.jpg",
  "birthday": "1990-05-15"
}
```

### Delete a User
**DELETE** `/api/users/:username`

## Database File

The SQLite database is stored at `server/dev.db`. It's excluded from version control via `.gitignore`.

## Migrations

Prisma migrations are stored in `server/prisma/migrations/`. To update the schema:

```bash
# Make changes to server/prisma/schema.prisma
npx prisma migrate dev --name description_of_changes
```
