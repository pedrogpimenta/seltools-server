const express = require('express')
const cloneDeep = require('lodash/cloneDeep')
const { MongoClient, ObjectID } = require('mongodb')
const aws = require('aws-sdk')
// const MongoClient = require('mongodb').MongoClient

const app = express()

aws.config.update({
  region: 'eu-west-1', // Put your aws region here
  accessKeyId: process.env.ACCESS_KEY_ID || 'AKIAJ4UOIGFPBDMUA75A',
  secretAccessKey: process.env.SECRET_ACCESS_KEY || 'A5F/oBRWMBZG1IiRnNHY/0XPses/16LBLQpobXf/',
})

const S3_BUCKET = 'seltools'

MongoClient.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/seltools', {
  useUnifiedTopology: true
})
  .then(client => {
    console.log('Connected to db')
    const db = client.db('seltools')
    // const files = db.collection('files')

    // ----------------- //
    // ------ API ------ //

    // TODO: This doesn't do anything
    app.get('/', (req, res) => {
      return res.send('STAGING You are probably looking for <a href="https://seltools.pimenta.co">seltools.pimenta.co</a>')
    })

    // ------ Document API ------ //

    // POST new document
    app.post('/document', (req, res) => {
      console.log('POST')
      const document = cloneDeep(req.body)

      db.collection('documents').findOne({_id: ObjectID(req.query.parent)})
        .then(results => {
          const parent = results
          const ancestors = parent.ancestors
          ancestors.push(ObjectID(req.query.parent))

          document.teacher = ObjectID(req.body.teacher) || document.teacher
          document.parent = ObjectID(document.parent)
          document.ancestors = ancestors
          document.level = parent.ancestors.length
          document.createDate = new Date()
    
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
          document.name = document.name + ' Clone'
    
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
          // if (!!req.body.teacher) document.teacher = ObjectID(req.body.teacher) || document.teacher
          if (!!req.body.parent) document.parent = ObjectID(req.body.parent) || document.parent
          // document.ancestors = document.ancestors
          document.level = document.ancestors.length || document.level
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
                // sharedWith: document.sharedWith || [],
              } },
            )
            .then(result => {
              console.log('document saved')
              return res.send(JSON.stringify({id: ObjectID(req.params.id)}))
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
                  console.log('document saved')
                  return res.send(JSON.stringify({id: ObjectID(req.params.id)}))
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
                name: req.body.name,
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
      db.collection('users').findOne({name: req.params.name})
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
                db.collection('documents')
                  .find({ $or: [ {parent: ObjectID(req.body.parent), type: 'folder' }, {parent: ObjectID(req.body.parent), type: 'document' } ] })
                  .sort({type: -1, createDate: -1}).toArray()
                  .then(results => {
                    res.send(results)
                  })
              } else {
                db.collection('users').insertOne({
                  name: req.body.name,
                  type: req.body.type,
                  folderId: results.insertedId,
                }).then(results => {
                  db.collection('documents')
                    .find({parent: ObjectID(req.body.parent), type: 'student' })
                    .sort({name: 1}).toArray()
                    // .toArray()
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

  })
  .catch(error => console.error(error))

module.exports = app
