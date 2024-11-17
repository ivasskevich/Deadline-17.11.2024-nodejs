var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var path = require('path');
var bodyParser = require('body-parser');
var sql = require('mssql');

var port = 1010;

let config = {
    server: 'DESKTOP-HG92H87\\SQLEXPRESS',
    database: 'ChatApp',
    user: 'PERSON',
    password: '12345',
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

sql.connect(config, function (err) {
    if (err) console.log('Database connection failed:', err);
    else console.log('Database connected');
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/login', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', function (req, res) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.post('/register', bodyParser.urlencoded({ extended: true }), function (req, res) {
    var { login, password, email, nickname } = req.body;

    let query = `SELECT * FROM Users WHERE name = @login OR email = @email`;
    let request = new sql.Request();
    request.input('login', sql.NVarChar, login);
    request.input('email', sql.NVarChar, email);

    request.query(query, function (err, result) {
        if (err) {
            console.log('Error:', err);
            res.send('Error occurred');
        } else {
            if (result.recordset.length > 0) {
                res.send('User already exists');
            } else {
                let insertQuery = `INSERT INTO Users (name, password, email, nickname) VALUES (@login, @password, @email, @nickname)`;
                let insertRequest = new sql.Request();
                insertRequest.input('login', sql.NVarChar, login);
                insertRequest.input('password', sql.NVarChar, password);
                insertRequest.input('email', sql.NVarChar, email);
                insertRequest.input('nickname', sql.NVarChar, nickname);

                insertRequest.query(insertQuery, function (err, result) {
                    if (err) {
                        console.log('Error:', err);
                        res.send('Error occurred');
                    } else {
                        res.redirect('/login');
                    }
                });
            }
        }
    });
});

app.post('/login', bodyParser.urlencoded({ extended: true }), function (req, res) {
    var { login, password } = req.body;

    let queryAdmin = `SELECT * FROM Admin WHERE name = @login AND password = @password`;
    let requestAdmin = new sql.Request();
    requestAdmin.input('login', sql.NVarChar, login);
    requestAdmin.input('password', sql.NVarChar, password);

    requestAdmin.query(queryAdmin, function (err, resultAdmin) {
        if (err) {
            console.log('Error:', err);
            res.send('Error occurred');
        } else {
            if (resultAdmin.recordset.length > 0) {
                res.redirect('/admin');
            } else {
                let queryUser = `SELECT * FROM Users WHERE name = @login AND password = @password`;
                let requestUser = new sql.Request();
                requestUser.input('login', sql.NVarChar, login);
                requestUser.input('password', sql.NVarChar, password);

                requestUser.query(queryUser, function (err, resultUser) {
                    if (err) {
                        console.log('Error:', err);
                        res.send('Error occurred');
                    } else {
                        if (resultUser.recordset.length > 0) {
                            const nickname = resultUser.recordset[0].nickname;
                            res.sendFile(path.join(__dirname, 'public', 'user.html'));
                            io.on('connection', (socket) => {
                                socket.emit('set nickname', nickname);
                            });
                        } else {
                            res.send('Invalid credentials');
                        }
                    }
                });
            }
        }
    });
});

app.get('/getUsers', (req, res) => {
    const request = new sql.Request();
    request.query('SELECT name, nickname, email FROM Users', (err, result) => {
        if (err) {
            console.error('Error fetching users:', err);
            res.status(500).send('Error fetching users');
            return;
        }
        res.json(result.recordset);
    });
});

app.post('/deleteUser', bodyParser.urlencoded({ extended: true }), (req, res) => {
    const { nickname } = req.body;
    const request = new sql.Request();
    request.input('nickname', sql.NVarChar, nickname);

    request.query('DELETE FROM Users WHERE nickname = @nickname', (err, result) => {
        if (err) {
            console.error('Error deleting user:', err);
            res.status(500).send('Error occurred while deleting user');
            return;
        }
        io.emit('user list');
        res.send('User deleted successfully');
    });
});

let users = [];
let chatHistory = [];

io.on('connection', (socket) => {
    console.log('A user connected');
    socket.emit('chat history', chatHistory);

    socket.on('new user', (username) => {
        if (username) {
            socket.username = username;
            if (!users.includes(username)) {
                users.push(username);
            }
            io.emit('user list', users);
        }
    });

    socket.on('send message', (msg) => {
        const message = { username: socket.username, text: msg, timestamp: new Date().toLocaleTimeString() };
        chatHistory.push(message);
        io.emit('chat message', message);
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            users = users.filter(user => user !== socket.username);
            io.emit('user list', users);
        }
    });
});

server.listen(port, function () {
    console.log('App running on port ' + port);
});
