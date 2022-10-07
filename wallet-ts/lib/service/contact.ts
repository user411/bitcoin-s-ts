import { BehaviorSubject, forkJoin, from, Observable, of, timer } from 'rxjs'
import { delayWhen, retryWhen, switchMap, tap } from 'rxjs/operators'

import { SendServerMessage, GetVersion } from 'common-ts/index.js'
import { ServerResponse, VersionResponse } from 'common-ts/type/server-types'
import { getMessageBody } from 'common-ts/util/message-util.js'
import { validateBoolean, validateNumber, validateString } from 'common-ts/util/validation-util.js'

import { Contact, WalletMessageType } from '../type/wallet-types'


const DEBUG = true // log actions in console.debug


export interface ConnectionCheckType {
  success: boolean|undefined
  time: number
}

const _initialized: BehaviorSubject<boolean> = new BehaviorSubject(false)
export function initialized() { return _initialized.value }
export const initialized$ = _initialized.asObservable()

const _contacts: BehaviorSubject<Contact[]> = new BehaviorSubject<Contact[]>([])
export function contacts() { return _contacts.value }
export const contacts$ = _contacts.asObservable()

const _connectionCheck: BehaviorSubject<{[address: string]: ConnectionCheckType}> = new BehaviorSubject({})
export function connectionCheck() { return _connectionCheck.value }
export const connectionCheck$ = _connectionCheck.asObservable()


export function initialize() {
  return forkJoin([
    getContactList(),
  ]).pipe(tap(results => {
    if (DEBUG) console.debug('Contacts.initialize()', results)
  }))
}

export function uninitialize() {
  _initialized.next(false)
  _contacts.next([])
  _connectionCheck.next({})
}

function getContactList() {
  return from(ContactList()).pipe(tap(result => {
    if (result) {
      if (result.result) {
        _contacts.next(result.result)
      } else {
        _contacts.next([])
      }
      _initialized.next(true)
    }
  }))
}

// TODO
// export function ContactUpdate(contact: Contact) {
  
// }

/** Contacts */

export function ContactList(): Promise<ServerResponse<Contact[]>> {
  if (DEBUG) console.debug('ContactList()')

  const m = getMessageBody(WalletMessageType.contactslist)
  return SendServerMessage(m)
}

export function ContactAdd(alias: string, address: string, memo: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('ContactAdd()', alias, address, memo)
  validateString(alias, 'ContactAdd()', 'alias')
  validateString(address, 'ContactAdd()', 'address')
  validateString(memo, 'ContactAdd()', 'memo')

  const m = getMessageBody(WalletMessageType.contactadd, [alias, address, memo])
  // Returns "ok"
  return SendServerMessage(m)
}

export function ContactRemove(address: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('ContactRemove()', address)
  validateString(address, 'ContactRemove()', 'address')

  const m = getMessageBody(WalletMessageType.contactremove, [address])
  // Returns "ok"
  return SendServerMessage(m)
}

export function DLCContactAdd(dlcId: string, address: string): Promise<ServerResponse<string>> {
  if (DEBUG)  console.debug('DLCContactAdd()', dlcId, address)
  validateString(dlcId, 'DLCContactAdd()', 'dlcId')
  validateString(address, 'DLCContactAdd()', 'address')

  const m = getMessageBody(WalletMessageType.dlccontactadd, [dlcId, address])
  // Returns "ok"
  return SendServerMessage(m)
}

export function DLCContactRemove(dlcId: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('DLCContactRemove()', dlcId)
  validateString(dlcId, 'DLCContactRemove()', 'dlcId')

  const m = getMessageBody(WalletMessageType.dlccontactremove, [dlcId])
  // Returns "ok"
  return SendServerMessage(m)
}

export const API = {
  ContactList,
  ContactAdd,
  ContactRemove,
  DLCContactAdd,
  DLCContactRemove,
};
