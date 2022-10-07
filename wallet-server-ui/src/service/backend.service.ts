import { Injectable } from '@angular/core'
import { MatDialog } from '@angular/material/dialog'
import { TranslateService } from '@ngx-translate/core'

import { MessageService } from '~service/message.service'
import { WalletStateService } from '~service/wallet-state-service'

import { WalletMessageType } from '~type/wallet-server-types'

import { formatNumber } from '~util/utils'
import { getMessageBody } from '~util/wallet-server-util'


import { ConfirmationDialogComponent } from '~app/dialog/confirmation/confirmation.component'
import { NewAddressDialogComponent } from '~app/dialog/new-address-dialog/new-address-dialog.component'
import { SendFundsDialogComponent } from '~app/dialog/send-funds-dialog/send-funds-dialog.component'

// Testing
// import * as CommonTS from 'common-ts/index'
// import * as WalletTS from 'wallet-ts/index'

/** Provides dialogs and any other UI elements with backend services calls */
@Injectable({ providedIn: 'root' })
export class BackendService {

  constructor(private translate: TranslateService, private dialog: MatDialog,
    private messageService: MessageService, public walletStateService: WalletStateService) {

      // console.warn('BackendService()')
      // Configure wallet-ts library
      
      // CommonTS.ConfigureServerURL('/api/v0') // /api/v0/
      // const token = localStorage.getItem('access_token')
      // if (token) {
      //   CommonTS.ConfigureAuthorizationHeader('Bearer ' + token)
      // }

      // Via proxy
      // WalletTS.ConfigureServerURL('/api/v0')
      // const token = localStorage.getItem('access_token')
      // if (token) {
      //   WalletTS.ConfigureAuthorizationHeader('Bearer ' + token)
      // }

      // Straight to backend
      // ConfigureServerURL('http://localhost:9999')
      // ConfigureAuthorizationHeader('Basic Yml0Y29pbnM6cGFzc3dvcmQ=') //  'bitcoins', 'password')

      // Test
      // this.getVersion()
    }

  /** Backend Common */

  // getVersion() {
  //   return WalletTS.GetVersion().then(result => {
  //     console.warn('GetVersion success', result)
  //   }, error => {
  //     console.error('GetVersion error')
  //   })
  // }

  /** Wallet */

  getNewAddress() {
    console.debug('getNewAddress()')

    this.messageService.sendMessage(getMessageBody(WalletMessageType.getnewaddress)).subscribe(r => {
      console.debug(' address:', r)
      if (r.result) {
        const dialog = this.dialog.open(NewAddressDialogComponent, {
          data: {
            title: 'dialog.newAddress.title',
            content: 'dialog.newAddress.content',
            params: { address: r.result },
            action: 'action.close',
          }
        })
      }
    })
  }

  sendFunds() {
    console.debug('sendFunds()')

    const dialog = this.dialog.open(SendFundsDialogComponent).afterClosed().subscribe(
      (sendObj: { address: string, amount: number, feeRate: number, sendMax: boolean }) => {
        console.debug(' sendFunds()', sendObj)

        if (sendObj) { // else the user was canceling
          if (sendObj.sendMax) {
            this.messageService.sendMessage(getMessageBody(WalletMessageType.sweepwallet,
              [sendObj.address, sendObj.feeRate])).subscribe(r => {
                console.debug('sweepwallet', r)
                if (r.result) {
                  const txId = r.result

                  const dialog = this.dialog.open(ConfirmationDialogComponent, {
                    data: {
                      title: 'dialog.sendFundsSuccess.title',
                      content: 'dialog.sendFundsSuccess.content',
                      params: { amount: this.translate.instant('unit.allAvailable'), address: sendObj.address, txId },
                      linksContent: 'dialog.sendFundsSuccess.linksContent',
                      links: [this.walletStateService.mempoolTransactionURL(txId, this.walletStateService.getNetwork())],
                      action: 'action.close',
                      showCancelButton: false,
                    }
                  })
                }
              })
          } else {
            const sats = sendObj.amount
            // amount on the server side is expected in bitcoin units
            const bitcoin = sats * 1e-8
            const noBroadcast = false

            this.messageService.sendMessage(getMessageBody(WalletMessageType.sendtoaddress,
              [sendObj.address, bitcoin, sendObj.feeRate, noBroadcast])).subscribe(r => {
                if (r.result) {
                  const txId = r.result

                  const dialog = this.dialog.open(ConfirmationDialogComponent, {
                    data: {
                      title: 'dialog.sendFundsSuccess.title',
                      content: 'dialog.sendFundsSuccess.content',
                      params: { amount: formatNumber(sats), address: sendObj.address, txId },
                      linksContent: 'dialog.sendFundsSuccess.linksContent',
                      links: [this.walletStateService.mempoolTransactionURL(txId, this.walletStateService.getNetwork())],
                      action: 'action.close',
                      showCancelButton: false,
                    }
                  })
                }
              })
          }
        }
      })
  }

}
