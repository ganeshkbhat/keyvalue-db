const tls = require('tls');
const readline = require('readline');

const options = {
    rejectUnauthorized: false // Set to true if using real CA certs
};

const client = tls.connect(8000, 'localhost', options, () => {
    console.log('Connected to Secure DB Server');
    console.log('Type "login admin password123" to begin.');
    shell.prompt();
});

const shell = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'DB_SHELL> '
});

client.on('data', (data) => {
    console.log(`\n${data.toString()}`);
    shell.prompt();
});

shell.on('line', (line) => {
    client.write(line.trim());
});

client.on('end', () => {
    console.log('Disconnected from server');
    process.exit();
});