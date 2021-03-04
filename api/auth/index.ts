import { request } from '../utils'

export async function sendSignIn (
  wsUrl: string,
  userId: string,
  accessSecret: string
) {
  try {
    await request('PUT', wsUrl, `token`, { userId, accessSecret })
  } catch (e) {
    if (e.message === 'Response code 400') {
      return false
    } else {
      throw e
    }
  }
  return true
}

export async function sendSignUp (
  wsUrl: string,
  userId: string,
  accessSecret: string
) {
  await request('POST', wsUrl, `users`, { userId, accessSecret })
}

export async function sendSignOut (wsUrl: string) {
  await request('DELETE', wsUrl, 'token')
}