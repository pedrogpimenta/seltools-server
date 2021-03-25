#!/usr/bin/env node

require('dotenv').config()

const passport = require('passport')
// const LocalStrategy = require('passport-local').Strategy
const jwt = require('jsonwebtoken')
const passportJWT = require('passport-jwt')
const ExtractJwt = passportJWT.ExtractJwt
const JwtStrategy = passportJWT.Strategy

const bcrypt = require('bcrypt')
const sendgridmail = require('@sendgrid/mail')
const cloneDeep = require('lodash/cloneDeep')
const { MongoClient, ObjectID } = require('mongodb')

const aws = require('aws-sdk')
aws.config.update({
  region: 'eu-west-1', // Put your aws region here
  accessKeyId: process.env.ACCESS_KEY_ID,
  secretAccessKey: process.env.SECRET_ACCESS_KEY,
})

const S3_BUCKET = 'seltools'
sendgridmail.setApiKey(process.env.SENDGRID_API_KEY)

/**
 * Module dependencies.
 */

const bodyParser= require('body-parser');
const cors = require('cors');

var app = require('../app');
var debug = require('debug')('seltools-server:server');
var http = require('http');

/**
 * Get port from environment and store in Express.
 */

var port = normalizePort(process.env.PORT);
app.set('port', port);
app.use(cors({
  credentials: true,
  origin: true
}));
app.options('*', cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));

/**
 * Create HTTP server.
 */

var server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

const io = require('socket.io')(server, {
  cors: {
    origin: process.env.WS_ORIGIN_URI,
    methods: ["GET", "POST"]
  }
});

// Helper: guid generator
const guidGenerator = () => {
  var S4 = function() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1)
  }

  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4())
}













/**
 * Connect to DB, then API and WebSockets
 */

MongoClient.connect(
  process.env.MONGODB_URI, {
    useUnifiedTopology: true
  }
)
  .then(client => {
    console.log('Connected to db')
    const db = client.db('seltools')

    // Reset connected users
    
    db.collection('users')
      .updateMany(
        {},
        { $set: {
          socketIds: [],
        } }
      )

    // ----------------- //
    // ----- AUTH ------ //

    const jwtOptions = {}
    jwtOptions.jwtFromRequest = ExtractJwt.fromAuthHeaderAsBearerToken();
    jwtOptions.secretOrKey = 'iWantToLiveInACyberpunkWorld';

    const strategy = new JwtStrategy(jwtOptions, function(jwt_payload, next) {
      db.collection('users').findOne({jwtId: jwt_payload.id})
        .then(results => {
          next(null, results);
        })
    });

    passport.use(strategy);

    app.post('/login', (req, res) => {
      db.collection('users').findOne({email: req.body.email})
        .then(results => {
          if (!!results) {
            if(bcrypt.compareSync(req.body.password, results.password)) {
              var payload = {_id: results._id};
              var token = jwt.sign(payload, jwtOptions.secretOrKey);
              res.json({message: "ok", token: token, user: results});
            } else {
              res.status(401).json({message:"Contraseña incorrecta."});
            }
          } else {
            res.status(401).json({message:"Usuario no encontrado. Verifica que tu email es correcto."});
          }
        })
    })
    
    app.post('/register', (req, res) => {
      db.collection('users').findOne({email: req.body.email})
        .then(userResults => {
          if(!userResults) {
            db.collection('documents')
              .insertOne({
                name: req.body.name,
                type: req.body.type,
                parent: req.body.teacher ? ObjectID(req.body.teacherFolder) : '',
              })
              .then(results => {
                db.collection('users').insertOne({
                    email: req.body.email,
                    password: bcrypt.hashSync(req.body.password, 10),
                    username: req.body.name,
                    type: req.body.type,
                    userfolder: ObjectID(results.insertedId),
                  })
                  .then(newUserResults => {
                    res.json({
                      message: 'ok',
                      newUserId: newUserResults.insertedId
                    });
                    
                    sendEmail({
                      emailTo: req.body.email,
                      templateId: 'd-7ec80a58953347ffb97693624419570b',
                      data: {
                        seltools_color: '#F87361',
                        user_email: req.body.email,
                      },
                    })
                  })
              })
          } else if (userResults && userResults.type !== 'teacher' && !userResults.userHasRegistered) {
            db.collection('users').updateOne(
              { email: req.body.email},
              { $set: {
                username: req.body.name,
                email: req.body.email,
                password: bcrypt.hashSync(req.body.password, 10),
                userHasRegistered: true,
              }})
              .then(newUserResults => {
                res.json({
                  message: 'ok',
                  newUserResults: newUserResults,
                })

                sendEmail({
                  emailTo: req.body.email,
                  subject: '¡Ya puedes acceder a tus documentos!',
                  templateId: 'd-9b4951a462e247f5ad4586c77edec147',
                  data: {
                    seltools_color: '#F87361',
                    user_name: req.body.name,
                  },
                })
              })
          } else {
            res.json({
              message: 'error',
              details: 'Este email ya fue utilizado',
            })
          }
        })
    })

    app.post('/recover', (req, res) => {
      const tempRecovery = guidGenerator()

      db.collection('users')
        .findOneAndUpdate(
          { email: req.body.email },
          { $set: {
            tempRecovery: tempRecovery,
          } }
        )
        .then(results => {
          if(!!results) {
            res.json({message: "ok"});

            sendEmail({
              emailTo: req.body.email,
              subject: 'Recuperar cuenta',
              templateId: 'd-605e13ccd74141c5aa486a8b54c7e53d',
              data: {
                seltools_color: '#F87361',
                temp_recovery: tempRecovery,
              }
            })
          }
        })
    })

    app.get('/resetexists/:recoveryId', (req, res) => {

      db.collection('users')
        .findOne({ tempRecovery: req.params.recoveryId })
        .then(results => {
          if (results) {
            res.json({message: "ok"});
          } else {
            res.json({message: "no"});
          }
        })
    })
    
    app.post('/resetpass/:recoveryId', (req, res) => {
      db.collection('users')
        .findOneAndUpdate(
          { tempRecovery: req.params.recoveryId },
          {
            $unset: {
              tempRecovery: '',
            },
            $set: {
              password: bcrypt.hashSync(req.body.password, 10),
            },
          }
        )
        .then(results => {
          res.json({message: "ok"});

          // sendEmail({
          //   emailTo: req.body.email,
          //   subject: 'Recuperar cuenta',
          //   templateId: 'd-605e13ccd74141c5aa486a8b54c7e53d',
          //   data: {
          //     seltools_color: '#F87361',
          //   }
          // })
        })
    })





    // ----------------- //
    // ------ API ------ //

    app.get('/', (req, res) => {
      return res.send('You are probably looking for <a href="https://seltools.pimenta.co">seltools.pimenta.co</a>')
    })

    // ------ Document API ------ //

    // POST new document
    app.post('/document', (req, res) => {
      console.log('POST')
      const document = cloneDeep(req.body)

      db.collection('documents').findOne({_id: ObjectID(req.query.parent)})
        .then(results => {
          const parent = results

          document.teacher = ObjectID(req.body.teacher) || document.teacher
          document.parent = ObjectID(document.parent)
          document.createDate = new Date()
          document.modifiedDate = new Date()
          document.modifiedBy = new Date()
    
          db.collection('documents').insertOne(document)
            .then(result => {
              console.log('document saved')
              return res.send(JSON.stringify({id: result.insertedId}))
            })
            .catch(error => console.error(error))
        })
    })

    // POST clone document
    app.post('/documentclone/:documentId', passport.authenticate('jwt', { session: false }), (req, res) => {
      console.log('CLONE')

      db.collection('documents').findOne({_id: ObjectID(req.params.documentId)})
        .then(results => {
          const document = results

          delete document._id
          document.name = document.name + ' (COPIA)'
          document.createDate = new Date()
          document.modifiedDate = new Date()
          document.shared = false
    
          db.collection('documents').insertOne(document)
            .then(result => {
              console.log('document saved')
              return res.send(JSON.stringify({id: result.insertedId}))
            })
            .catch(error => console.error(error))
        })

    })

    // PUT document
    app.put('/document/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
      console.log('PUT')

      db.collection('documents')
        .find({_id: ObjectID(req.params.id)})
        .toArray()
        .then(results => {
          const document = cloneDeep(results[0])

          document.name = req.body.name || document.name
          document.color = req.body.color || document.color
          document.shared = typeof req.body.shared === 'undefined' ? document.shared : req.body.shared
          if (!!req.body.parent) document.parent = ObjectID(req.body.parent) || document.parent
          if (req.query.shouldUpdateDate === 'true') document.modifiedDate = new Date()

          if (!!req.body.files) {
            if (req.body.files.length < document.files.length) {
              document.files.splice(req.body.files.length, document.files.length - req.body.files.length)
            }

            for (let file in req.body.files) {
              if (document.files.length <= file) document.files.push({})
  
              // TODO: improve this. I do this because if document.content === '', it will keep the content of the previous file
              // This happens with other things (previously with name, but I now send null and it works)
              // All of this should be improved though
              document.files[file].content = ''
  
              document.files[file].id = req.body.files[file].id || document.files[file].id
              document.files[file].type = req.body.files[file].type || document.files[file].type
              document.files[file].name = req.body.files[file].name || document.files[file].name
              document.files[file].url = req.body.files[file].url || document.files[file].url
              document.files[file].markers = req.body.files[file].markers || document.files[file].markers
              document.files[file].content = req.body.files[file].content || document.files[file].content
              document.files[file].highlights = req.body.files[file].highlights || document.files[file].highlights
              document.files[file].textInputs = req.body.files[file].textInputs || document.files[file].textInputs
              document.files[file].lines = req.body.files[file].lines || document.files[file].lines
              document.files[file].creator = req.body.files[file].creator || document.files[file].creator
              document.files[file].stamps = req.body.files[file].stamps || document.files[file].stamps
              document.files[file].hidden = typeof req.body.files[file].hidden === 'undefined' ? false : req.body.files[file].hidden === true ? true : req.body.files[file].hidden === false ? false : document.files[file].hidden
            }
          }

          db.collection('documents').updateOne(
              { _id: ObjectID(req.params.id) },
              { $set: {
                name: document.name,
                color: document.color,
                // teacher: document.teacher,
                parent: document.parent,
                files: document.files,
                shared: document.shared,
                modifiedDate: document.modifiedDate,
                hidden: document.hidden,
                // modifiedBy: document.modifiedBy,
                // sharedWith: document.sharedWith || [],
              } },
            )
            .then(result => {
              return res.send(result)
            })
            .catch(error => console.error(error))
        })
    })
    
    // MOVE document
    app.put('/documentmove/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
      console.log('MOVE')

      db.collection('documents').find({_id: ObjectID(req.params.id)}).toArray()
        .then(results => {
          const document = cloneDeep(results[0])

          db.collection('documents').findOne({_id: ObjectID(req.body.parentId)})
            .then(result => {

              db.collection('documents').updateOne(
                  { _id: ObjectID(req.params.id) },
                  { $set: {
                    parent: ObjectID(req.body.parentId),
                  } },
                )
                .then(result => {
                  return res.send(result)
                })
                .catch(error => console.error(error))
            })
        })
    })

    // GET: one document
    app.get('/document/:id', (req, res) => {
      // TODO: should this be findOne ?
      db.collection('documents')
        // .findOne({_id: ObjectID(req.params.id)})
        .aggregate([
          {
            $graphLookup: {
              from: 'documents',
              startWith: "$parent",
              connectFromField: "parent",
              connectToField: "_id",
              as: "breadcrumbs",
              depthField: "depth",
            }
          },
          {
            $match: { 
              _id: ObjectID(req.params.id),
            }
          }
        ])
        .toArray()
        .then(results => {
          const document = results[0]
          const breadcrumbs = document.breadcrumbs.sort((a, b) => b.depth - a.depth)

          return res.send({document: document, breadcrumbs: breadcrumbs})
        })
    })

    // DELETE one document
    app.delete('/document/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
      db.collection('documents').deleteOne({_id: ObjectID(req.params.id)})
        .then(results => {
          return res.send(results)
        })
    })

    // GET: documents
    app.get('/user/:userId/documents/:folderId', passport.authenticate('jwt', { session: false }), (req, res) => {
      db.collection('documents')
        .aggregate([
          {
            $graphLookup: {
              from: 'documents',
              startWith: "$parent",
              connectFromField: "parent",
              connectToField: "_id",
              as: "breadcrumbs",
              depthField: "depth",
            }
          },
          {
            $match: { 
              $or: [
                {_id: ObjectID(req.params.folderId)},
                {parent: ObjectID(req.params.folderId)},
              ]
            }
          }
        ])
        .project({files: 0, modifiedDate: 0, sharedWith: 0, locked: 0, lockedBy: 0})
        .sort({name: 1})
        .toArray()
        .then(results => {
          const folder = results.find((doc) => doc._id == req.params.folderId)
          let documents = results.filter((doc) => doc.parent == req.params.folderId)
          const students = req.query.isTeacherFolder === 'true' ? results.filter((doc) => doc.type === 'student') : []
          const breadcrumbs = folder.breadcrumbs.sort((a, b) => b.depth - a.depth)

          if (req.query.userIsStudent === 'true') {
            documents = documents.filter((doc) => doc.shared === true)
          }

          if (documents.length) {
            documents = documents.sort((a, b) => new Date(b.createDate) - new Date(a.createDate))
          }

          return res.send({folder: folder, breadcrumbs: breadcrumbs, documents: documents, students: students})
        })
    })
        
    // ------ Student API ------ //

    // POST: one student folder & user
    app.post('/newStudent', passport.authenticate('jwt', { session: false }), (req, res) => {
      db.collection('documents')
        .insertOne({
          name: req.body.name,
          type: 'student',
          parent: ObjectID(req.body.teacherFolder),
          createDate: new Date(),
        })
        .then(results => {
          db.collection('users').insertOne({
            username: req.body.name,
            email: req.body.email,
            type: 'student',
            userfolder: results.insertedId,
            userHasRegistered: false,
            teacherId: ObjectID(req.body.teacherId),
          })
          .then(() => {
            res.send('ok')
          })
        .catch(error => console.error(error))
      })
    })

    // GET: one student user
    app.get('/student/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
      db.collection('users').findOne({userfolder: ObjectID(req.params.id)})
        .then(results => {
          return res.send(results)
        })
    })

    // PUT: one student folder & user
    app.put('/student/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
      console.log('PUT student')

      db.collection('users').updateOne(
          { _id: ObjectID(req.params.id) },
          { $set: {
            username: req.body.username,
            email: req.body.email,
          } },
        )
        .then((userResult) => {

          db.collection('documents').updateOne(
            { _id: ObjectID(req.body.userfolder) },
            { $set: {
              name: req.body.username,
            } },
          )
          .then(() => {
            return res.send(userResult)
          })
          .catch(error => console.error(error))

          // return res.send(userResult)
        })
        .catch(error => console.error(error))
    })
    
    // DELETE: one student folder & user
    app.delete('/student/:id', passport.authenticate('jwt', { session: false }), (req, res) => {
      console.log('DELETE student')

      db.collection('users')
        .deleteOne({userfolder: ObjectID(req.params.id)})
        .then(() => {
          db.collection('documents')
            .deleteOne({_id: ObjectID(req.params.id)})
            .then(results => {

              return res.send(results)
            })

        })
    })


    // ------ User API ------ //
    
    // GET: one user
    app.get('/user/:userId', passport.authenticate('jwt', { session: false }), (req, res) => {
      db.collection('users')
        .aggregate([
          {
            $lookup: {
              from: 'users',
              localField: "teacherId",
              foreignField: "_id",
              as: "teacher",
            }
          },
          {
            $match: { 
              $or: [
                {_id: ObjectID(req.params.userId)},
                {
                  teacherId: ObjectID(req.params.userId),
                  'socketIds.0': {$exists: true},
                },
              ]
            }
          }
        ])
        .project({teacher: {_id: 0, email: 0, type: 0, userfolder: 0, password: 0, socketIds: 0}})
        .toArray()
        .then(results => {
          const user = results.find((user) => user._id == req.params.userId)
          const students = results.filter((user) => user.teacherId == req.params.userId)

          return res.send({user: user, students: students})
        })
    })

    // GET: one user name
    // app.get('/username/:userId', (req, res) => {
    //   db.collection('users').findOne({_id: ObjectID(req.params.userId)})
    //     .then(results => {
    //       return res.send({username: results.username, userfolder: results.userfolder})
    //     })
    // })

    // ------ Folders API ------ //

    // POST: new folder
    app.post('/folder', passport.authenticate('jwt', { session: false }), (req, res) => {
      db.collection('documents').findOne({_id: ObjectID(req.body.parent)})
        .then(results => {
          db.collection('documents').insertOne({
              name: req.body.name,
              type: req.body.type,
              parent: ObjectID(req.body.parent),
              createDate: new Date(),
            })
            .then(results => {
              if (req.body.type === 'folder') {
                res.send(results)
              } else {
                db.collection('users').insertOne({
                  name: req.body.name,
                  type: req.body.type,
                  folderId: results.insertedId,
                }).then(results => {
                  db.collection('documents')
                    .find({parent: ObjectID(req.body.parent), type: 'student' })
                    .sort({name: 1}).toArray()
                    .then(results => {
                      res.send(results)
                    })
                })
              }
            })
            .catch(error => console.error(error))
        })
    })


    // ------ AWS API ------ //

    // FILE AWS S3 BUCKET
    app.post('/sign_s3', (req, res) => {
      const s3 = new aws.S3({signatureVersion: 'v4'})  // Create a new instance of S3
      const fileName = req.body.fileName
      const fileType = req.body.fileType

      const s3Params = {
        Bucket: S3_BUCKET,
        Key: `files/${fileName}`,
        Expires: 500,
        ContentType: fileType,
        ACL: 'public-read',
      }

      s3.getSignedUrl('putObject', s3Params, (err, data) => {
        if (err) {
          console.log(err)
          res.json({success: false, error: err})
        }

        const returnData = {
          signedRequest: data,
          url: `https://${S3_BUCKET}.s3.amazonaws.com/files/${fileName}`
        }

        res.json({success:true, data:{returnData}});
      })

    })

    // ---- END API ---- //
    // ----------------- //




    
    // - BEGIN SOCKETS - //
    // ----------------- //

    io.on('connection', socket => {
      // Save user as online
      db.collection('users')
        .findOneAndUpdate(
          { _id: ObjectID(socket.request._query.userId) },
          {
            $push: {
              socketIds: socket.id,
            }
          },
        )
        .then(result => {
          console.log(`user "${result.value.username}" is online`)

          if (result.value.type === 'teacher') return

          db.collection('users')
            .find(
              { $or: [
                { _id: ObjectID(result.value.teacherId) },
                {
                  teacherId: ObjectID(result.value.teacherId),
                  'socketIds.0': {$exists: true},
                },
              ]}
            )
            .toArray()
            .then(results => {
              const teacherSocketIds = results.find(user => user.type === 'teacher').socketIds
              const students = results.filter(user => user.type === 'student')
              for (let i in teacherSocketIds) {
                socket.to(teacherSocketIds[i]).emit('connected students', students)
              }
            })
        })
        .catch(error => console.error(error))

      socket.on('disconnect', () => {
        db.collection('users')
          .findOneAndUpdate(
            { socketIds: socket.id },
            {
              $pull: {
                socketIds: socket.id,
              }
            },
          )
          .then(result => {
            console.log(`user "${result.value.username}" is offline`)

            db.collection('documents')
              .find({ lockedBy: ObjectID(result.value._id) })
              .toArray()
              .then(docResults => {

                db.collection('documents')
                  .updateMany(
                    {
                      lockedBy: ObjectID(result.value._id),
                    },
                    { $set: {
                      locked: false,
                      lockedBy: '',
                    } }
                  )
                  .then(updatedDocResults => {
                    db.collection('users')
                      .find({
                        teacherId: ObjectID(result.value.teacherId),
                        'socketIds.0': { $exists: true },
                      })
                      .toArray()
                      .then(results => {
                        for (let i in docResults) {
                          socket.broadcast.emit('document reload', docResults[i]._id)
                        }
                        socket.broadcast.emit('connected students', results)
                      })
                  })
              })
          })
          .catch(error => console.error(error))
      })

      socket.on('document unlock', (userId, documentId) => {
        console.log(`user "${userId}" closed document "${documentId}"`)

        db.collection('documents')
          .updateMany(
              {
                _id: ObjectID(documentId),
                lockedBy: ObjectID(userId),
              },
              { $set: {
                locked: false,
                lockedBy: '',
              }
            }
          )
          .then(docResults => {
              socket.broadcast.emit('document reload', documentId)
          })
      })

      socket.on('document open', (userId, documentId) => {
        console.log(`user "${userId}" opened document "${documentId}"`)

        db.collection('documents')
          .find({_id: ObjectID(documentId)})
          .toArray()
          .then(results => {
            const document = cloneDeep(results[0])

            if (!document.locked) {
              console.log('document NOT locked, now locking...')
              db.collection('documents').updateOne(
                  { _id: ObjectID(documentId) },
                  { $set: {
                    locked: true,
                    lockedBy: ObjectID(userId),
                  } },
                )
                .then(result => {
                  // return res.send(result)
                })
                .catch(error => console.error(error))
            } else {
              console.log('document already locked by:', document.lockedBy)
            }
          })

      })

      socket.on('document saved', (userId, documentId) => {
        console.log(`user "${userId}" saved document "${documentId}"`)

        db.collection('documents').find({_id: ObjectID(documentId)}).toArray()
          .then(results => {
            const document = cloneDeep(results[0])

            if (!document.locked) {
              console.log('document NOT locked, now locking...')
              db.collection('documents').updateOne(
                  { _id: ObjectID(documentId) },
                  { $set: {
                    locked: true,
                    lockedBy: ObjectID(userId),
                  } },
                )
                .then(result => {
                  socket.broadcast.emit('document reload', documentId)
                })
                .catch(error => console.error(error))
            } else {
              socket.broadcast.emit('document reload', documentId)
              console.log('document already locked by:', document.lockedBy)
            }
          })
      })

      socket.on('unlock document', (userId, documentId) => {
        console.log(`user "${userId}" is unlocking the document ${documentId}`)

        db.collection('documents').updateOne(
            { _id: ObjectID(documentId) },
            { $set: {
              locked: true,
              lockedBy: ObjectID(userId),
            } },
          )
          .then(result => {
            socket.broadcast.emit('lock document', userId, documentId)
          })
          .catch(error => console.error(error))
      })
      
      // socket.on('document saved after unlock', (userId, documentId) => {
      //   console.log(`user "${userId}" saved document "${documentId}" after unlock`)
      //   socket.broadcast.emit('document reload', documentId)
      // })
    });

    // -- END SOCKETS -- //
    // ----------------- //

  })
  .catch(error => console.error(error))

// --- SEND EMAIL -- //
// ----------------- //

const sendEmail = (content) => {
  const msg = {
    to: content.emailTo,
    from: 'Seldocs <hola@seldocs.com>',
    subject: content.subject,
    template_id: content.templateId,
    dynamic_template_data: content.data
  }

  sendgridmail
    .send(msg)
    .then(() => {
      console.log('email sent')
    })
    .catch((error) => {
      console.error(error)
    })
}