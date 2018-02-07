const path = require('path')
const http = require('http')
const Koa = require('koa')
const app = new Koa()
const server = http.createServer(app.callback())
const static = require('koa-static')
const Router = require('koa-router')
const send = require('koa-send')
const router = new Router()
const logger = require('koa-logger')
const mysql = require('mysql')
const Promise = require('bluebird')
const koaBody = require('koa-body')
const fs = require('fs-extra')
const uniqueString = require('unique-string')

let conn = mysql.createConnection(require('./mysql'))
conn = Promise.promisifyAll(conn)
conn.connect()

let io = require('socket.io')(server)

app.use(logger())
app.use(static(path.join(__dirname, 'dist/')))
app.use(static(path.join(__dirname, 'public/')))
app.use(koaBody({multipart: true}))
router
    .post('/upload', async (ctx, next) => {
        let data = ctx.request.body.files.file
        let usr = ctx.request.body.fields.usr
        let filename = `${uniqueString()}.jpg`
        const reader = fs.createReadStream(data.path)
        const stream = fs.createWriteStream(`./public/${filename}`)
        reader.pipe(stream)
        await conn.queryAsync(`UPDATE test SET imgUrl='${filename}' WHERE usr='${usr}'`)
        ctx.body = {
            status: 200,
            imgUrl: filename,
        }
    })
    .post('/signup', async (ctx, next) => {
        let {usr, pwd} = ctx.request.body
        let data = await conn.queryAsync(`SELECT * FROM test WHERE usr = '${usr}'`)
        if (data[0]) {
            ctx.body = {
                status: 404,
                message: '用户名已存在',
            }
        }
        else {
            await conn.query(`INSERT INTO test VALUES (?, ?, ?, default)`, [null, usr, pwd])
            ctx.body = {
                status: 200,
                message: '注册成功',
            }
        }
    })
    .post('/signin', async (ctx, next) => {
        let {usr, pwd} = ctx.request.body
        let data = await conn.queryAsync(`SELECT * FROM test WHERE usr = '${usr}' AND pwd = '${pwd}'`)
        if (data[0]) {
            ctx.cookies.set('usr', usr, {
                httpOnly: false,
            })
            ctx.cookies.set('imgUrl', data[0].imgUrl, {
                httpOnly: false,
            })
            ctx.body = {
                status: 200,
                message: '登陆成功',
            }
        }
        else {
            ctx.body = {
                status: 404,
                message: '登陆失败',
            }
        }
    })

app
    .use(router.routes())
    .use(router.allowedMethods())
server.listen(3000, () => {
    console.log('Running at 3000 port')
})


//在线人数
let userList = {}
io.on('connection', function(socket) {
    socket.on('login', (data) => {
        let user = data
        Object.assign(userList, {
            [user.id]: user
        })
        io.emit('login', {id: user.id, userList})
    })

    socket.on('disconnect', () => {
        let id = socket.id
        delete userList[id]
        socket.broadcast.emit('logout', id)
    })

    socket.on('chat', data => {
        console.log( Object.assign(data, userList[data.id]))
        io.emit('chat', Object.assign(data, userList[data.id]))
        // userList.forEach((item, index) => {
        //     if (data.id === item.id) {
        //         io.emit('chat', Object.assign(item, data))
        //     }
        // })
    })
});
