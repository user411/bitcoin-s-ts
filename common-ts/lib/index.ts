// Native fetch is not recognized by compiler yet despite the @types/node: 18.x
declare function fetch(url: any, options: any): Promise<any>

import { ServerMessage } from './type/server-message.js'
import { MessageType, ServerResponse, VersionResponse } from './type/server-types'

import { getMessageBody } from './util/message-util.js'
import { validateString } from './util/validation-util.js'


let SERVER_URL = 'http://localhost:9999/' // default to bitcoin-s server
let AUTHORIZATION_HEADER = '' // default to no auth

const DEBUG = true // log actions in console.debug

/** Set Wallet Server endpoint */
export function ConfigureServerURL(url: string): void {
  console.debug('ConfigureServerURL()', url)
  SERVER_URL = url
}
/** Set Wallet Server Authorization header */
export function ConfigureAuthorizationHeader(header: string): void {
  console.debug('ConfigureAuthorizationHeader()', header)
  AUTHORIZATION_HEADER = header
}
/** Set Authorization Header from user and password strings */
export function ConfigureAuthorizationHeaderFromUserPassword(user: string, password: string): void {
  console.debug('ConfigureAuthorizationHeader()', user)
  AUTHORIZATION_HEADER = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')
}

/** Send any ServerMessage */
export function SendServerMessage(message: ServerMessage, customConfig = {}): Promise<ServerResponse<any>> {
  if (!message) return Promise.reject(Error('SendServerMessage() null message'))

  const headers: any = { 'Content-Type': 'application/json' }
  if (AUTHORIZATION_HEADER) headers['Authorization'] = AUTHORIZATION_HEADER
  const config: any = {
    method: 'POST',
    // mode: 'no-cors', // 'same-origin',
    ...customConfig,
    headers: {
      ...headers,
    },
    body: JSON.stringify(message)
  }

  // console.debug('config:', config)

  return fetch(`${SERVER_URL}`, config)
    .then(async response => {
      // if (response.status === 401) {
      //   // autologout / redirect
      // }
      if (response.ok) {
        return <ServerResponse<any>> await response.json()
      } else {
        const errorMessage = await response.text()
        return Promise.reject(new Error(errorMessage))
      }
    })
}

const OFFLINE_POLLING_TIME = 5000 // ms
export async function PollingLoop(message?: ServerMessage, delay = OFFLINE_POLLING_TIME) {
  if (!message) message = getMessageBody(MessageType.getversion)
  let shouldContinue = true // doesn't really control anything
  let r: ServerResponse<any>
  function wait(ms = delay) {
    // console.debug('wait', ms)
    return new Promise(resolve => { setTimeout(resolve, ms); })
  }
  while (shouldContinue) {
    try {
      const r = await SendServerMessage(message)
      shouldContinue = false
      return r
    } catch (err) {
      await wait()
    }
  }
}

import { from, Observable } from 'rxjs'

export function PollingLoopObs(message?: ServerMessage, delay = OFFLINE_POLLING_TIME): Observable<ServerResponse<any> | undefined> {
  return from(PollingLoop(message, delay))
}

/** Common bitcoin-s message functions */ 

/** Get Server Version */
export function GetVersion(): Promise<ServerResponse<VersionResponse>> {
  if (DEBUG) console.debug('GetVersion()')

  const m = getMessageBody(MessageType.getversion)
  return SendServerMessage(m)
}

/** Zip Server DataDir */
export function ZipDataDir(path: string): Promise<ServerResponse<string|null>> {
  if (DEBUG) console.debug('ZipDataDir()')
  validateString(path, 'ZipDataDir()', 'path')

  const m = getMessageBody(MessageType.zipdatadir, [path])
  // result: 'failure' / null
  return SendServerMessage(m)
}

/** TODO : Inheritable Shared State Model? */

// export interface CommonStateModel {
//   version: string
// }

// export class CommonStateImpl implements CommonStateModel {
//   version: string
// }

// const state = new BehaviorSubject<CommonStateModel>(new CommonStateImpl())
// export const CommonState = state.asObservable()

// export default {
//   // ...ENTRY_POINTS
//   ConfigureServerURL,
//   ConfigureAuthorizationHeader,
//   ConfigureAuthorizationHeaderFromUserPassword,
//   SendServerMessage,
//   GetVersion,
//   ZipDataDir
// };
