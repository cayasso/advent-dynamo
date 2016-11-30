'use strict'

/**
 * Module dependencies.
 */

import 'babel-polyfill'
import { DynamoDB } from 'aws-sdk'

const ENDPOINT = process.env.AWS_DYNAMODB_ENDPOINT
const REGION = process.env.AWS_REGION
const DISCONNECTED = 'DISCONNECTED'
const CONNECTING = 'CONNECTING'
const CONNECTED = 'CONNECTED'

export default (endpoint = ENDPOINT, options = {}) => {
  let db = null
  let status = DISCONNECTED

  if (endpoint instanceof DynamoDB) {
    db = endpoint
  } else if ('string' !== typeof endpoint) {
    options = endpoint || options
    endpoint = undefined
  }

  const {
    reads = 5,
    writes = 5,
    hash = 'entityId',
    eventTable = 'events'
  } = options

  db = db || new DynamoDB({ endpoint, region: 'us-east-1' })

  const client = new DynamoDB.DocumentClient(db)

  async function connect() {
    if (CONNECTING === status) {
      await delay(500)
      await connect()
    } else if (CONNECTED !== status) {
      status = CONNECTING
      await ensureTable(eventTable)
      status = CONNECTED
    }
    return status
  }

  function ensureTable(TableName) {
    return new Promise((accept, reject) => {
      try {
      db.describeTable({ TableName }, (err, info) => {
        if (err) {
          if ('ResourceNotFoundException' === err.code) {
            db.createTable({
              TableName,
              AttributeDefinitions: [{
                AttributeName: hash,
                AttributeType: 'S'
              },{
                AttributeName: 'key',
                AttributeType: 'S'
              }],
              KeySchema: [{
                AttributeName: hash,
                KeyType: 'HASH'
              },{
                AttributeName: 'key',
                KeyType: 'RANGE'
              }],
              ProvisionedThroughput: {
                ReadCapacityUnits: reads,
                WriteCapacityUnits: writes
              }
            }, (err, data) => {
              if (err) reject(err)
              else accept(data.TableDescription)
            });
          } else {
            reject(err)
          }
        } else {
          accept(info.Table)
        }
      })
    } catch(e){ console.log(e) }
    })
  }

  /**
   * Load events.
   *
   * @param {String|Number} id
   * @param {Promise}
   * @api public
   */

  async function load(id) {
    await connect()

    let limit = 1000
    let events = []
    let start = null

    const loadMore = () => (events.length < limit || limit === -1)
      ? start !== null
      : false

    const query = {
      TableName: eventTable,
      ExpressionAttributeValues: { ':e': id },
      KeyConditionExpression: `${hash} = :e`
    }

    do {
      if (start) query.ExclusiveStartKey = start
      const _events = await new Promise((accept, reject) => {
        client.query(query, (err, data) => {
          if (err) return reject(err)
          start = data.LastEvaluatedKey || null
          accept(data.Items)
        })
      })
      events = [...events, ..._events]
    } while(loadMore())

    return events.sort((a, b) => {
      return a.ts - b.ts
    })
  }

  /**
   * Save events.
   *
   * @param {Array} events
   * @return {Promise}
   * @api public
   */

  async function save(events) {
    await connect()
    if (Array.isArray(events)) {
      events = events.filter(e => !!e.entityId)
      if (!events.length) return []
      for (const e of events) await save(e)
      return events
    }

    return new Promise((accept, reject) => {
      client.put({
        TableName: eventTable,
        Item: normalize(events),
      }, (err, data) => {
        if (err) reject(err)
        else accept(data)
      })
    })
  }

  function delay(time) {
    return new Promise((resolve) => {
      setTimeout(resolve, time)
    })
  }

  function normalize(event) {
    return {
      ...event,
      key: `${(event.ts ? new Date(event.ts) : new Date()).toISOString()}`
    }
  }

  return { load, save }
}
