# smajpihub App - Backend

An Express API server with MongoDB for storing user data and session details.

## Getting Started

> For Docker setup, see the [Docker Setup documentation](../doc/docker-setup.md).

### 1. Install dependencies

Requires Node.js (v18 LTS or v20 LTS recommended) and `yarn`.

```sh
yarn install
```

### 2. Set up environment variables

Create a `.env` file from the template:

```shell
cp .env.example .env
```

Configure the following variables:

| Variable         | Description                    | Example                 |
| ---------------- | ------------------------------ | ----------------------- |
| `SESSION_SECRET` | Random string (64+ characters) | `your_random_string`    |
| `PI_API_KEY`     | From Pi Developer Portal       | `your_api_key`          |
| `FRONTEND_URL`   | Frontend URL for CORS          | `http://localhost:3314` |

You can obtain your `PI_API_KEY` from the Pi Developer Portal. See the [Pi Developer Guide](https://pi-apps.github.io/community-developer-guide/docs/gettingStarted/devPortal/) for details.

### Pi App Notification Center

The existing notification pipeline can optionally deliver user-approved updates to the Pi App Notification Center. Configure the server-side Pi API key for the deployment network (`PI_API_KEY` for legacy/Testnet or `PI_MAINNET_API_KEY` for Mainnet). Users enable the `in_app_notifications` scope from the app's Notifications page; the backend verifies the Pi identity and scope before saving consent. The key must remain on the backend and must not be added to frontend `VITE_*` variables.

Run the notification API and delivery tests with:

```sh
npm run test:notifications
```

### 3. Set up MongoDB

The default MongoDB port is `27017`. Update your `.env` file if you use different credentials.

#### Option A: Using Docker (recommended)

```sh
docker run --name smajpihub-mongo -d \
  -e MONGO_INITDB_ROOT_USERNAME=smajpihub \
  -e MONGO_INITDB_ROOT_PASSWORD=dev_password \
  -p 27017:27017 mongo:7.0
```

Manage the container:

```sh
docker stop smajpihub-mongo   # Stop
docker start smajpihub-mongo  # Start
docker rm -f smajpihub-mongo  # Remove (deletes all data)
```

#### Option B: Install MongoDB locally

Install MongoDB Community from the [official documentation](https://www.mongodb.com/docs/manual/administration/install-community/).

Then create a user via `mongosh`:

```javascript
var MONGODB_DATABASE_NAME = "smajpihub-development";
var MONGODB_USERNAME = "smajpihub";
var MONGODB_PASSWORD = "dev_password";

db.getSiblingDB("admin").createUser({
  user: MONGODB_USERNAME,
  pwd: MONGODB_PASSWORD,
  roles: [{ role: "dbOwner", db: MONGODB_DATABASE_NAME }],
});
```

### 4. Run the server

```sh
yarn start
```

If configured correctly, you should see:

```
NODE_ENV: development
Connected to MongoDB on: mongodb://localhost:27017/smajpihub-development
SMAJ PI HUB backend listening on port 8000!
CORS config: configured to respond to a frontend hosted on http://localhost:3314
```

---

You've completed the backend setup. Return to the [development guide](../doc/development.md) to continue.
