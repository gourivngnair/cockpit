import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../ui/toastContext'
import { VAPID_PUBLIC_KEY } from './config'

export type PushState = 'unsupported' | 'blocked' | 'off' | 'on'

/** The browser wants the public key as bytes. */
export function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** Turning notifications on or off for this one device. */
export function usePush() {
  const toast = useToast()
  const [state, setState] = useState<PushState>(supported() ? 'off' : 'unsupported')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!supported()) return setState('unsupported')
    if (Notification.permission === 'denied') return setState('blocked')
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      setState(sub && Notification.permission === 'granted' ? 'on' : 'off')
    } catch {
      setState('off')
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const enable = useCallback(async () => {
    if (!supported()) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off')
        toast('Notifications were not allowed. You can allow them in the browser settings for this site.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY) }))
      const json = sub.toJSON()
      const p256dh = json.keys?.p256dh
      const auth = json.keys?.auth
      if (!json.endpoint || !p256dh || !auth) throw new Error('This browser gave no push keys.')
      await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint)
      const { error } = await supabase.from('push_subscriptions').insert({ endpoint: json.endpoint, p256dh, auth, user_agent: navigator.userAgent.slice(0, 200) })
      if (error) throw error
      setState('on')
      toast('Notifications are on for this device.')
    } catch (e) {
      toast(`Could not turn notifications on${e instanceof Error && e.message ? ` (${e.message})` : ''}.`)
      void refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh, toast])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        await sub.unsubscribe()
      }
      setState('off')
      toast('Notifications are off for this device.')
    } catch {
      toast('Could not turn notifications off.')
    } finally {
      setBusy(false)
    }
  }, [toast])

  const sendTest = useCallback(async () => {
    setBusy(true)
    try {
      const res: { data: { sent?: number; devices?: number } | null; error: Error | null } = await supabase.functions.invoke('notify', { body: { test: true } })
      if (res.error) throw res.error
      const sent = res.data?.sent ?? 0
      toast(sent > 0 ? `Test sent to ${sent} ${sent === 1 ? 'device' : 'devices'}.` : 'No device is subscribed yet.')
    } catch {
      toast('Could not send the test.')
    } finally {
      setBusy(false)
    }
  }, [toast])

  return { state, busy, enable, disable, sendTest }
}
