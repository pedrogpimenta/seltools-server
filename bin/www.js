#!/usr/bin/env node

const cloneDeep = require('lodash/cloneDeep')
const { MongoClient, ObjectID } = require('mongodb')
const aws = require('aws-sdk')
aws.config.update({
  region: 'eu-west-1', // Put your aws region here
  accessKeyId: process.env.ACCESS_KEY_ID || 'AKIAJ4UOIGFPBDMUA75A',
  secretAccessKey: process.env.SECRET_ACCESS_KEY || 'A5F/oBRWMBZG1IiRnNHY/0XPses/16LBLQpobXf/',
})

const S3_BUCKET = 'seltools'

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

var port = normalizePort(process.env.PORT || '3000');
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
    origin: process.env.WS_ORIGIN_URI || "http://192.168.8.180:3001",
    methods: ["GET", "POST"]
  }
});



/**
 * Connect to DB, then API and WebSockets
 */

MongoClient.connect(
  process.env.MONGODB_URI ||
  'mongodb://localhost:27017/seltools', {
    useUnifiedTopology: true
  }
)
  .then(client => {
    console.log('Connected to db')
    const db = client.db('seltools')
    // const files = db.collection('files')

    // ----------------- //
    // ------ API ------ //

    // TODO: This doesn't do anything
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
          console.log('req parent:', req.query.parent)
          console.log('results:', results)
          const parent = results
          const ancestors = parent.ancestors || []
          ancestors.push(ObjectID(req.query.parent))

          document.teacher = ObjectID(req.body.teacher) || document.teacher
          document.parent = ObjectID(document.parent)
          document.ancestors = ancestors
          document.level = parent.ancestors.length
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

    // POST new document
    app.post('/documentclone/:documentId', (req, res) => {
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
    app.put('/document/:id', (req, res) => {
      console.log('PUT')

      db.collection('documents').find({_id: ObjectID(req.params.id)}).toArray()
        .then(results => {
          const document = cloneDeep(results[0])

          document.name = req.body.name || document.name
          document.color = req.body.color || document.color
          document.shared = typeof req.body.shared === 'undefined' ? document.shared : req.body.shared
          if (!!req.body.parent) document.parent = ObjectID(req.body.parent) || document.parent
          document.level = document.ancestors.length || document.level
          if (req.query.shouldUpdateDate === 'true') document.modifiedDate = new Date()
          // document.modifiedBy = req.query.userId

          // if (!!req.body.teacher) document.teacher = ObjectID(req.body.teacher) || document.teacher
          // document.ancestors = document.ancestors
          // document.sharedWith = req.body.sharedWith || document.sharedWith || []

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
              document.files[file].creator = req.body.files[file].creator || document.files[file].creator
              document.files[file].stamps = req.body.files[file].stamps || document.files[file].stamps
            }
          }


          db.collection('documents').updateOne(
              { _id: ObjectID(req.params.id) },
              { $set: {
                name: document.name,
                color: document.color,
                // teacher: document.teacher,
                parent: document.parent,
                ancestors: document.ancestors,
                level: document.level,
                files: document.files,
                shared: document.shared,
                modifiedDate: document.modifiedDate,
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
    app.put('/documentmove/:id', (req, res) => {
      console.log('MOVE')

      db.collection('documents').find({_id: ObjectID(req.params.id)}).toArray()
        .then(results => {
          const document = cloneDeep(results[0])

          db.collection('documents').findOne({_id: ObjectID(req.body.parentId)})
            .then(result => {

              const documentAncestors = result.ancestors
              documentAncestors.push(ObjectID(req.body.parentId))

              db.collection('documents').updateOne(
                  { _id: ObjectID(req.params.id) },
                  { $set: {
                    parent: ObjectID(req.body.parentId),
                    ancestors: documentAncestors,
                    level: 0,
                  } },
                )
                .then(result => {
                  return res.send(result)
                })
                .catch(error => console.error(error))
            })
        })
    })

    // GET all documents
    // TODO: This should be removed, list all shouldn't be possible
    app.get('/documents', (req, res) => {
      // return res.send('These are your files')
      db.collection('documents').find().sort({createDate: -1}).toArray()
        .then(results => {
          const documents = cloneDeep(results)
          
          for (let document in documents) {
            delete documents[document].files
            delete documents[document].markers
            delete documents[document].sharedWith
          }

          return res.send(documents)
        })
    })

    // GET: one document
    app.get('/document/:id', (req, res) => {
      // TODO: should this be findOne ?
      db.collection('documents').findOne({_id: ObjectID(req.params.id)})
        .then(results => {
          const document = results
          db.collection('documents').find(
            {_id: { $in: document.ancestors }})
            .sort({level: 1}).toArray()
            .then(results => {
              return res.send({document: document, breadcrumbs: results})
            })

          // return res.send(results)
        })
    })

    // DELETE one document
    app.delete('/document/:id', (req, res) => {
      db.collection('documents').deleteOne({_id: ObjectID(req.params.id)})
        .then(results => {
          return res.send(results)
        })
    })

    // ------ Student API ------ //

    // GET all students
    // TODO: This should be removed, list all shouldn't be possible
    app.get('/students', (req, res) => {
      // return res.send('These are your files')
      db.collection('students').find().toArray()
        .then(results => {
          return res.send(results)
        })
    })

    // POST: new student
    app.post('/student', (req, res) => {
      let studentId = ''

      db.collection('students').insertOne(req.body)
        .then(result => {
          studentId = result.insertedId
          db.collection('users').updateOne(
              { username: 'Selen' },
              { $addToSet: { students: {
                _id: result.insertedId,
                username: req.body.name,
              } } },
            )
            .then(result => {
              return res.send({_id: studentId, name: req.body.name})
            })
        })
        .catch(error => console.error(error))
    })

    // GET: one student
    app.get('/student/:name', (req, res) => {
      db.collection('users').findOne({username: req.params.name})
        .then(results => {
          return res.send(results)
        })
    })

    // ------ User API ------ //
    
    // GET: one user
    app.get('/user/:name', (req, res) => {
      db.collection('users').findOne({username: req.params.name})
        .then(results => {
          return res.send({user: results})
        })
    })

    app.get('/user/:userId/documents/:folderId', (req, res) => {
      db.collection('users').findOne({_id: ObjectID(req.params.userId)})
        .then(results => {
          if (results.type === 'teacher') {
            db.collection('documents').findOne({_id: ObjectID(req.params.folderId)})
              .then(results => {
                const folder = results

                if (folder.type === 'teacher') {
                  db.collection('documents')
                    .find({parent: ObjectID(folder._id), type: 'student'})
                    .sort({name: 1}).toArray()
                    .then(results => {
                      const students = results;
                      
                      db.collection('documents')
                        .find({ $or: [ {parent: ObjectID(req.params.folderId), type: 'folder' }, {parent: ObjectID(req.params.folderId), type: 'document' } ] })
                        .sort({type: -1, createDate: -1}).toArray()
                        .then(results => {
                          const documents = results
                
                          db.collection('documents').find(
                            {_id: { $in: folder.ancestors }})
                            .sort({level: 1}).toArray()
                            .then(results => {
                              return res.send({students: students, folder: folder, documents: documents, breadcrumbs: results})
                            })
                        })
                    })
                } else {
                  db.collection('documents')
                    .find({ $or: [ {parent: ObjectID(req.params.folderId), type: 'folder' }, {parent: ObjectID(req.params.folderId), type: 'document' } ] })
                    .sort({type: -1, createDate: -1}).toArray()
                    .then(results => {
                      const documents = results
            
                      db.collection('documents').find(
                        {_id: { $in: folder.ancestors }}
                      ).sort({level: 1}).toArray()
                        .then(results => {
                          return res.send({folder: folder, documents: documents, breadcrumbs: results})
                        })
                    })
                }
              })
          } else {

            db.collection('documents').findOne({_id: ObjectID(req.params.folderId)})
              .then(results => {
                const folder = results

                db.collection('documents')
                  .find({ $or: [ {parent: ObjectID(req.params.folderId), type: 'folder', shared: true}, {parent: ObjectID(req.params.folderId), type: 'document', shared: true } ] })
                  .sort({type: -1, createDate: -1}).toArray()
                  .then(results => {
                    const documents = results
          
                    db.collection('documents').find(
                      {_id: { $in: folder.ancestors }}
                    ).sort({level: 1}).toArray()
                      .then(results => {
                        return res.send({folder: folder, documents: documents, breadcrumbs: results})
                      })
                  })
              })
          }
        })

    })

    // ------ Folders API ------ //

    // POST: new folder
    app.post('/folder', (req, res) => {
      db.collection('documents').findOne({_id: ObjectID(req.body.parent)})
        .then(results => {
          const ancestors = results.ancestors
          ancestors.push(results._id)
    
          db.collection('documents').insertOne({
              name: req.body.name,
              type: req.body.type,
              parent: ObjectID(req.body.parent),
              createDate: new Date(),
              ancestors: ancestors,
              level: ancestors.length,
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

    let connectedClients = []

    io.on('connection', socket => {
      console.log('client connected:', socket.id)
      // console.log('client connected', socket)
    
      socket.on('disconnect', (reason) => {
        console.log('client disconnected:', socket.id)
        const disconnectingClient = connectedClients.find(client => client.socketId === socket.id)
        const newConnectedClients = connectedClients.filter(client => client.socketId !== socket.id)
        connectedClients = newConnectedClients

        if (!disconnectingClient) return false

        db.collection('documents').updateOne(
            { lockedBy: ObjectID(disconnectingClient.userId) },
            { $set: {
              locked: false,
              lockedBy: null,
            } },
          )
          .then(result => {
            socket.broadcast.emit('document reload', disconnectingClient.documentId)
          })
          .catch(error => console.error(error))
      })

      socket.on('document open', (userId, documentId) => {
        console.log(`user "${userId}" opened document "${documentId}"`)
        connectedClients.push({socketId: socket.id, userId: userId, documentId: documentId})
        // console.log('connectedClients:', connectedClients)

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
                  // return res.send(result)
                })
                .catch(error => console.error(error))
            } else {
              console.log('document already locked by:', document.lockedBy)
            }
          })

      })

      socket.on('document saved', (userId, documentId) => {
        // console.log('document saved, should reload on others:', documentId)
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
            console.log('aj')
            socket.broadcast.emit('save and lock document', userId, documentId)
          })
          .catch(error => console.error(error))
      })
      
      socket.on('document saved after unlock', (userId, documentId) => {
        // console.log('document saved, should reload on others:', documentId)
        console.log(`user "${userId}" saved document "${documentId}" after unlock`)
        socket.broadcast.emit('document reload', documentId)
      })
    });

    // -- END SOCKETS -- //
    // ----------------- //





    // ---- TEMP API v2.0 ---- //

    app.get('/deletealldocuments', (req, res) => {
      console.log('delete all')
      db.collection('documents').removeMany({})
    })
    app.get('/insertselen', (req, res) => {
      console.log('insert selen')
      db.collection('documents').insertOne(
        {
          "name": "Selen",
          "type": 'teacher',
          "parent": '',
          "ancestors": [],
          "level": 0,
        }) 
    })
    app.get('/resetdocs', (req, res) => {
      console.log('reset docs')
      db.collection('documents').update({},
        {$set : {
          "parent": ObjectID('5fc2b5aab8d35a3cb835ed71'),
          "type": 'document',
          "level": 1,
          "ancestors": [ObjectID('5fc2b5aab8d35a3cb835ed71')],
        }},
        {upsert:false,
        multi:true}) 
    })
    app.get('/resetselen', (req, res) => {
      console.log('reset selen')
      db.collection('documents').updateOne({name: "Selen"},
        {$set : {
          "parent": '',
          "type": 'teacher',
          "level": 0,
          "ancestors": [],
        }},
        {upsert:false,
        multi:true}) 
    })

  })
  .catch(error => console.error(error))
