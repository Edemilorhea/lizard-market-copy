module.exports = {
  apps: [
    {
      name: "discord-orchestrator",
      script: "C:/Users/TC/.bun/bin/bun.exe",
      args: "safe-start.ts",
      cwd: "E:/Tools/lizard-market/plugins/discord-orchestrator",
      // IMPORTANT: Disabled watch mode to prevent auto-restart when bot modifies its own code
      // Use '/reload' command in Discord ops channel or 'pm2 restart discord-orchestrator' manually
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
