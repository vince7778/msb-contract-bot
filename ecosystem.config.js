module.exports = {
  apps: [{
    name: 'msb-contract-bot',
    script: 'src/index.js',
    cwd: '/Users/vinceesgana/Contract Bot/msb-contract-bot',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
