module.exports = {
  apps: [
    {
      name: "discord-orchestrator",
      script: "C:/Users/TC/.bun/bin/bun.exe",
      args: "safe-start.ts",  // Use safe startup script
      cwd: "E:/Tools/lizard-market/plugins/discord-orchestrator",
      watch: ["server.ts", "src"],
      watch_delay: 2000,  // Give more time for file writes to complete
      ignore_watch: ["node_modules", ".git", "logs", "dist", "safe-start.ts"],
      autorestart: true,
      max_restarts: 5,  // Reduce max restarts since we auto-recover
      restart_delay: 3000,  // More delay between restarts
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
