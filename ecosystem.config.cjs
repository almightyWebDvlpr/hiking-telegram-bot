module.exports = {
  apps: [
    {
      name: "hiking-bot-prod",
      script: "src/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        APP_STAGE: "prod"
      }
    },
    {
      name: "hiking-bot-test",
      script: "src/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        APP_STAGE: "test"
      }
    }
  ]
};
