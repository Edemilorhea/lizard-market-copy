module.exports = {
  apps: [
    {
      name: "discord-orchestrator",
      script: "C:/Users/TC/.bun/bin/bun.exe",
      args: "server.ts",
      cwd: "E:/Tools/lizard-market/plugins/discord-orchestrator",
      watch: ["server.ts", "src"],
      watch_delay: 1000,
      ignore_watch: ["node_modules", ".git", "logs"],
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
