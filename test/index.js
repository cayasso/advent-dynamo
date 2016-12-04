import { DynamoDB } from 'aws-sdk'
import createEngine from '../src/index'

let db = null
let engine = null
let testEvents = [
  { entityId: '1', entity: 'test', type: 'created', payload: { a: 1 } },
  { entityId: '1', entity: 'test', type: 'updated', payload: { a: 2 } },
  { entityId: '1', entity: 'test', type: 'tested', payload: { a: 3 } },
  { entityId: '2', entity: 'test', type: 'created', payload: { a: 1 } },
  { entityId: '3', entity: 'test', type: 'created', payload: { a: 2 } },
  { entityId: '3', entity: 'test', type: 'created', payload: { a: 3 } }
]

let client = null

describe('advent-dynamo', () => {

  before(() => {
    client = new DynamoDB({ endpoint: 'http://localhost:8000', region: 'us-east-1' })
    engine = createEngine(client)
  })

  it('should be a function', () => {
    createEngine.should.be.a.Function
  })

  it('should return an object', () => {
    engine.should.be.an.Object
  })

  it('should export the right methods', () => {
    engine.save.should.be.a.Function
    engine.load.should.be.a.Function
  })

  describe('save', () => {

    it('should return a promise', () => {
      engine.save([]).then.should.be.a.Promise
    })

    it('should save events', function (done) {
      this.timeout(0);
      engine.save(testEvents).then(events => {
        events.length.should.eql(testEvents.length)
        events.should.eql(testEvents)
        done()
      }).catch(done)
    })

    it('should not save events with missing ids', function (done) {
      this.timeout(0);
      let wrongEvents = [
        { type: 'updated', payload: { a: 2 } },
        { type: 'updated', payload: { a: 2 } }
      ]
      engine.save(wrongEvents).then(events => {
        events.length.should.eql(0)
        events.should.eql([])
        done()
      }).catch(done)
    })
  })

  describe('load', () => {

    it('should return a promise', () => {
      engine.load('1').then.should.be.a.Promise
    })

    it('should load events by id', (done) => {
      let id = '1'
      engine.load(id).then(events => {
        events.length.should.eql(3)
        events.map(e => {
          delete e.key
          return e
        }).should.eql(testEvents.filter(e => e.entityId === id))
        done()
      }).catch(done)
    })

  })

  after((done) => {
    const params = { TableName: 'events' }
    client.describeTable(params, (err, info) => {
      if (err) return done(err)
      client.deleteTable(params, done)
    })
  })

})
