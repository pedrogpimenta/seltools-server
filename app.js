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
      return res.send('You are probably looking for <a href="https://seltools.pimenta.co">seltools.pimenta.co</a>')
    })

    // ------ Document API ------ //

    // POST new document
    app.post('/document', (req, res) => {
      console.log('POST')
      const document = cloneDeep(req.body)

      document.createDate = new Date()

      db.collection('documents').insertOne(document)
        .then(result => {
          console.log('document saved')
          return res.send(JSON.stringify({id: result.insertedId}))
        })
        .catch(error => console.error(error))
    })

    // PUT document
    app.put('/document/:id', (req, res) => {
      console.log('PUT')

      db.collection('documents').find({_id: ObjectID(req.params.id)}).toArray()
        .then(results => {
          const document = cloneDeep(results[0])

          document.name = req.body.name || document.name
          document.sharedWith = req.body.sharedWith || document.sharedWith || []

          if (req.body.files.length < document.files.length) {
            document.files.splice(req.body.files.length, document.files.length - req.body.files.length)
          }

          for (let file in req.body.files) {
            if (document.files.length <= file) document.files.push({})

            document.files[file].id = req.body.files[file].id || document.files[file].id
            document.files[file].type = req.body.files[file].type || document.files[file].type
            document.files[file].name = req.body.files[file].name || document.files[file].name
            document.files[file].url = req.body.files[file].url || document.files[file].url
            document.files[file].markers = req.body.files[file].markers || document.files[file].markers
            document.files[file].content = req.body.files[file].content || document.files[file].content
            document.files[file].highlights = req.body.files[file].highlights || document.files[file].highlights
            document.files[file].creator = req.body.files[file].creator || document.files[file].creator
          }

          db.collection('documents').updateOne(
              { _id: ObjectID(req.params.id) },
              { $set: {
                name: document.name,
                files: document.files,
                sharedWith: document.sharedWith || [],
              } },
            )
            .then(result => {
              console.log('document saved')
              return res.send(JSON.stringify({id: ObjectID(req.params.id)}))
            })
            .catch(error => console.error(error))
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
      db.collection('documents').find({_id: ObjectID(req.params.id)}).toArray()
        .then(results => {
          return res.send(results)
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

    // POST: new document to student
    app.post('/student/:id/document', (req, res) => {
      db.collection('documents').find({_id: ObjectID(req.body._id)}).toArray()
        .then(result => {
          const documentShares = result[0].sharedWith
          let userIDHasShare = null
          const documentName = result[0].name

          for (let share in documentShares) {
            console.log('documentShares[share]._id:', documentShares[share]._id, 'req.params.id:', req.params.id)
            if (documentShares[share]._id == req.params.id) {
              console.log('share:', share)
              userIDHasShare = share
            }
          }

          // console.log(`Success! Removed document: "${req.body._id}" from user ${req.params.id}`)
          // console.log('userIDHasShare:', userIDHasShare)

          if (!!userIDHasShare) {
            // console.log('happen useridhasshare')
            db.collection('students').updateOne(
                { _id: ObjectID(req.params.id) },
                { $pull: { documents: {
                  _id: req.body._id,
                  // name: documentName,
                } } },
              )
              .then(result => {
                db.collection('documents').updateOne(
                  { _id: ObjectID(req.body._id) },
                  { $pull: { sharedWith: { _id: ObjectID(req.params.id) } } },
                )
                  .then(result => {
                    return res.send(`Success! Removed document: "${req.body._id}" from user ${req.params.id}`)
                  })
              })
              .catch(error => console.error(error))

          } else {
            // console.log('happen eelse')
            db.collection('students').updateOne(
                { _id: ObjectID(req.params.id) },
                { $addToSet: { documents: {
                  _id: req.body._id,
                } } },
              )
              .then(result => {
                db.collection('documents').updateOne(
                  { _id: ObjectID(req.body._id) },
                  { $addToSet: { sharedWith: { _id: ObjectID(req.params.id) } } },
                )
                  .then(result => {
                    return res.send(`Success! Added new document: "${req.body.id}" to user ${req.params.id}`)
                  })
              })
              .catch(error => console.error(error))
          }

        })

    })

    // GET: one student
    app.get('/student/:name', (req, res) => {
      db.collection('students').find({name: req.params.name}).toArray()
        .then(results => {
          db.collection('documents').find(
            {
              sharedWith: {
                _id: ObjectID(results[0]._id)
              }
            }
          ).sort({createDate: -1}).toArray()
            .then(items => {
              results[0].documents = items

              return res.send(results)
            })
        })
    })

    // ------ User API ------ //
    
    // GET: one user
    app.get('/user/:name', (req, res) => {
      // TODO: should this be findOne ?
      db.collection('users').find({username: req.params.name}).toArray()
        .then(results => {

          // for (let student in results.students) {
          //   db.collection('students').find({name: results.students[student].name}).toArray()
          //     .then(studentResult => {
                
          //     })

          // }

          return res.send(results)
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
