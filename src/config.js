import dotenv from 'dotenv';

dotenv.config();

export const config = {
  appPort: Number(process.env.APP_PORT || 3000),
  botName: process.env.BOT_NAME || 'Cloud Nest Bot',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  ignoreGroups: process.env.IGNORE_GROUPS === 'true',
  ignorePrivates: process.env.IGNORE_PRIVATES === 'true'
};
