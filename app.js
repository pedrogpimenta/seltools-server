const express = require('express')
const { MongoClient, ObjectID } = require('mongodb')
// const MongoClient = require('mongodb').MongoClient

const app = express()

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
      return res.send('Received a GET HTTP method')
    })

    // ------ Document API ------ //

    // POST new document
    app.post('/document', (req, res) => {
      console.log('POST')
      db.collection('documents').insertOne(req.body)
        .then(result => {
          console.log('document saved')
          return res.send(JSON.stringify({id: result.insertedId}))
        })
        .catch(error => console.error(error))
    })

    // POST new document
    app.put('/document/:id', (req, res) => {
      console.log('PUT')
      db.collection('documents').updateOne(
          { _id: ObjectID(req.params.id) },
          { $set: req.body },
        )
      // db.collection('documents').insertOne(req.body)
        .then(result => {
          console.log('document saved')
          console.log(result)
          return res.send(JSON.stringify({id: ObjectID(req.params.id)}))
        })
        .catch(error => console.error(error))
    })
    
    // GET all documents
    // TODO: This should be removed, list all shouldn't be possible
    app.get('/documents', (req, res) => {
      // return res.send('These are your files')
      db.collection('documents').find().toArray()
        .then(results => {
          console.log(results)
          return res.send(results)
        })
    })

    // GET: one document
    app.get('/document/:id', (req, res) => {
      // TODO: should this be findOne ?
      db.collection('documents').find({_id: ObjectID(req.params.id)}).toArray()
        .then(results => {
          // console.log(results)
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
          // console.log(results)
          return res.send(results)
        })
    })

    // POST: new student
    app.post('/student', (req, res) => {
      db.collection('students').insertOne(req.body)
        .then(result => {
          // console.log(result)
          db.collection('users').updateOne(
              { username: 'Selen' },
              { $addToSet: { students: {
                _id: result.insertedId,
                name: req.body.name,
              } } },
            )
            .then(result => {
              return res.send(`Success! Added student: "${req.body.name}" to user: Selen`)
            })
        })
        .catch(error => console.error(error))
    })

    // POST: new document to student
    app.post('/student/:id/document', (req, res) => {
      console.log('request:', req)
      db.collection('students').updateOne(
          { _id: ObjectID(req.params.id) },
          { $addToSet: { documents: {
            _id: req.body._id,
            name: req.body.name,
          } } },
        )
        .then(result => {
          // console.log(result)
          db.collection('documents').updateOne(
            { _id: ObjectID(req.body._id) },
            { $addToSet: { sharedWith: { _id: ObjectID(req.params.id) } } },
          )
            .then(result => {
              return res.send(`Success! Added new document: "${req.body.id}" to user ${req.params.id}`)
            })
        })
        .catch(error => console.error(error))
    })

    // GET: one student
    app.get('/student/:name', (req, res) => {
      // TODO: should this be findOne ?
      db.collection('students').find({name: req.params.name}).toArray()
        .then(results => {
          // console.log(results)
          return res.send(results)
        })
    })

    // ------ User API ------ //
    
    // GET: one user
    app.get('/user/:name', (req, res) => {
      // TODO: should this be findOne ?
      db.collection('users').find({username: req.params.name}).toArray()
        .then(results => {
          // console.log(results)

          // for (let student in results.students) {
          //   db.collection('students').find({name: results.students[student].name}).toArray()
          //     .then(studentResult => {
                
          //     })

          // }

          return res.send(results)
        })
    })

    // ---- END API ---- //
    // ----------------- //

  })
  .catch(error => console.error(error))

module.exports = app
