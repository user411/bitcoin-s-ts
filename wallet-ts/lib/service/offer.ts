import { BehaviorSubject, forkJoin, from, of } from 'rxjs'
import { tap, catchError, map } from 'rxjs/operators'

import { SendServerMessage } from 'common-ts/index.js'
import { ServerResponse } from 'common-ts/type/server-types'
import { getMessageBody } from 'common-ts/util/message-util.js'
import { validateBoolean, validateNumber, validateString } from 'common-ts/util/validation-util.js'

import { IncomingOffer, WalletMessageType } from '../type/wallet-types'
import { OfferWithHex } from '../type/wallet-ui-types'

import { DecodeOffer } from '..'


const DEBUG = true // log actions in console.debug

const _initialized: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false)
export function initialized() { return _initialized.value }
export const initialized$ = _initialized.asObservable()

const _offers: BehaviorSubject<IncomingOffer[]> = new BehaviorSubject<IncomingOffer[]>([])
export function offers() { return _offers.value }
export const offers$ = _offers.asObservable()

const _decodedOffers: BehaviorSubject<{ [offerHash: string]: OfferWithHex }> = 
  new BehaviorSubject<{ [offerHash: string]: OfferWithHex }>({})
export function decodedOffers() { return _decodedOffers.value }
export const decodedOffers$ = _decodedOffers.asObservable()


function getOfferHashByTemporaryContractId(temporaryContractId: string): string|undefined {
  for (const hash of Object.keys(_decodedOffers.value)) {
    if (_decodedOffers.value[hash].offer.temporaryContractId === temporaryContractId) {
      return hash
    }
  }
  return undefined
}


export function initialize() {
  return forkJoin([
    loadIncomingOffers(),
  ]).pipe(tap(results => {
    if (DEBUG) console.debug('Offers.initialize()', results)
  }))
}

export function uninitialize() {
  _initialized.next(false)
  _offers.next([])
  _decodedOffers.next({})
}

function loadIncomingOffers() {
  return from(OfferList())
  .pipe(tap(r => {
    // console.debug('offers-list', r)
    if (r.result) {
      const offers = r.result
      _offers.next(offers)
      decodeOffers(offers)
    }
  }))
}

function decodeOffers(offers: IncomingOffer[]) {
  console.debug('decodeOffers()')
  if (offers.length === 0) {
    // No additional data to load
    _initialized.next(true)
  }
  return forkJoin(offers.map(offer => decodeOffer(offer.offerTLV)))
    .subscribe((results: Array<OfferWithHex|null>) => {
      for (let i = 0; i < results.length; i++) {
        if (results[i])
         _decodedOffers.value[offers[i].hash] = <OfferWithHex>results[i]
      }
      _decodedOffers.next(_decodedOffers.value)
      _initialized.next(true)
    })
}

function decodeOffer(offerTLV: string) {
  // console.debug('decodeOffer()')
  // return this.messageService.sendMessage(getMessageBody(CoreMessageType.decodeoffer, [offerTLV]), false)
  return from(DecodeOffer(offerTLV))
  .pipe(catchError(error => of({ result: null })), map(r => {
    // console.debug(' decodeoffer', r)
    if (r.result) {
      const offerWithHex = <OfferWithHex>{ offer: r.result, hex: offerTLV }
      return offerWithHex
    } else {
      // TODO
      // const dialog = this.dialog.open(ErrorDialogComponent, {
      //   data: {
      //     title: 'dialog.decodingDLCError.title',
      //     content: 'dialog.decodingDLCError.content',
      //     params: { state: DLCState.offered },
      //   }
      // })
      return null
    }
  }))
}

/** External Interface */

export function addIncomingOffer(offerTLV: string, peer: string, message: string) {
  // return this.messageService.sendMessage(getMessageBody(WalletMessageType.offeradd, [offerTLV, peer, message]))
  return from(OfferAdd(offerTLV, peer, message))
  .pipe(tap(r => {
    console.debug(' offer-add', r)
    if (r.result) { // hash.hex
      
    }
  }))
}

export function removeIncomingOffer(hash: string) {
  // return this.messageService.sendMessage(getMessageBody(WalletMessageType.offerremove, [hash]))
  return from(OfferRemove(hash))
  .pipe(tap(r => {
    console.debug(' offer-remove', r)
    if (r.result) { // hash.hex
      const hash = r.result
      delete _decodedOffers.value[hash]
      _decodedOffers.next(_decodedOffers.value)
    }
  }))
}

export function removeIncomingOfferByTemporaryContractId(temporaryContractId: string) {
  const hash = getOfferHashByTemporaryContractId(temporaryContractId)
  if (hash) {
    removeIncomingOffer(hash).subscribe()
  }
}

export function sendIncomingOffer(offerTLVorTempId: string, peer: string, message: string) {
  // return this.messageService.sendMessage(getMessageBody(WalletMessageType.offersend, [offerTLVorTempId, peer, message]))
  return from(OfferSend(offerTLVorTempId, peer, message))
  .pipe(tap(r => {
    console.debug(' offer-send', r)
    if (r.result) { // hash.hex
      
    }
  }))
}

export function incomingOfferReceived(offer: IncomingOffer) {
  _offers.value.push(offer)
  _offers.next(_offers.value)
  return decodeOffer(offer.offerTLV).subscribe(r => { // pipe(tap()) instead?
    if (r) {
      _decodedOffers.value[offer.hash] = <OfferWithHex>r
      _decodedOffers.next(_decodedOffers.value)
    }
  })
}

export function incomingOfferRemoved(hash: string) {
  const index = _offers.value.findIndex(o => o.hash === hash)
  if (index !== -1) {
    _offers.value.splice(index, 1)
    _offers.next(_offers.value)
  }
  delete _decodedOffers.value[hash]
  _decodedOffers.next(_decodedOffers.value)
}

/** API */

export function OfferList(): Promise<ServerResponse<IncomingOffer[]>> {
  if (DEBUG) console.debug('OfferList()')

  const m = getMessageBody(WalletMessageType.offerslist)
  return SendServerMessage(m)
}

export function OfferAdd(offerTLV: string, peer: string, message: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('OfferAdd()', peer, message)
  validateString(offerTLV, 'OfferAdd()', 'offerTLV')
  validateString(peer, 'OfferAdd()', 'peer')
  validateString(message, 'OfferAdd()', 'message')

  const m = getMessageBody(WalletMessageType.offeradd, [offerTLV, peer, message])
  // Returns hash.hex
  return SendServerMessage(m)
}

export function OfferRemove(hash: string): Promise<ServerResponse<string>> {
  if (DEBUG) console.debug('OfferRemove()', hash)
  validateString(hash, 'OfferRemove()', 'hash')

  const m = getMessageBody(WalletMessageType.offerremove, [hash])
  // Returns hash.hex
  return SendServerMessage(m)
}

export function OfferSend(offerTLVorTempId: string, peer: string, message: string): Promise<ServerResponse<unknown>> {
  if (DEBUG) console.debug('OfferRemove()', offerTLVorTempId, peer, message)
  validateString(offerTLVorTempId, 'OfferSend()', 'offerTLVorTempId')
  validateString(peer, 'OfferSend()', 'peer')
  validateString(message, 'OfferSend()', 'message')

  const m = getMessageBody(WalletMessageType.offersend, [offerTLVorTempId, peer, message])
  // Returns unknown
  return SendServerMessage(m)
}

export const API = {
  OfferList, OfferAdd, OfferRemove, OfferSend,
};
