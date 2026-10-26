import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "react-router"

import type { AuthSession, MfaRequired, User } from "@twextjs/twexthubkit"

import { th } from "@/lib/twexthub"

export interface SignInInput {
  namespace: string
  password: string
}

export type SignInResult =
  | { kind: "session"; session: AuthSession }
  | { kind: "mfa"; challenge: MfaRequired }

interface AuthContextValue {
  user: User | null
  loading: boolean
  isAdmin: boolean
  signIn: (input: SignInInput) => Promise<SignInResult>
  completeMfa: (payload: {
    mfaToken: string
    response?: Record<string, unknown>
    backupCode?: string
  }) => Promise<AuthSession>
  signUp: (input: {
    namespace: string
    password: string
    displayName?: string
  }) => Promise<AuthSession>
  acceptSession: (session: AuthSession) => void
  remember: (remember: boolean) => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: User | null
}) {
  const [user, setUserState] = useState<User | null>(initialUser)
  const navigate = useNavigate()

  // The session cookie is written by the server. The in-memory user is what
  // keeps the header and guards in step until the next page-load, so auth
  // changes do not force loaders (such as the sign-in redirect) to re-run
  // mid-flow.
  const acceptSession = useCallback((session: AuthSession) => {
    setUserState(session.user)
  }, [])

  const signIn = useCallback(
    async (input: SignInInput): Promise<SignInResult> => {
      const result = await th.sessions.create({
        namespace: input.namespace,
        password: input.password,
      })

      if ("mfaRequired" in result) {
        return { kind: "mfa", challenge: result }
      }

      acceptSession(result)
      return { kind: "session", session: result }
    },
    [acceptSession]
  )

  const completeMfa = useCallback<AuthContextValue["completeMfa"]>(
    async (payload) => {
      const session = await th.auth.verifyMfa(payload)
      acceptSession(session)
      return session
    },
    [acceptSession]
  )

  const signUp = useCallback<AuthContextValue["signUp"]>(
    async (input) => {
      const session = await th.users.create(input)
      acceptSession(session)
      return session
    },
    [acceptSession]
  )

  const remember = useCallback((stay: boolean) => {
    void fetch("/__session/remember", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ remember: stay }),
      credentials: "same-origin",
    })
  }, [])

  const signOut = useCallback(async () => {
    try {
      await th.sessions.revokeCurrent()
    } catch {
      // The local session is gone either way.
    } finally {
      setUserState(null)
      navigate("/")
    }
  }, [navigate])

  const refresh = useCallback(async () => {
    const account = await th.users.me()
    setUserState(account)
  }, [])

  const setUser = useCallback((account: User) => {
    setUserState(account)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading: false,
      isAdmin: user?.role === "admin",
      signIn,
      completeMfa,
      signUp,
      acceptSession,
      remember,
      signOut,
      refresh,
      setUser,
    }),
    [
      user,
      signIn,
      completeMfa,
      signUp,
      acceptSession,
      remember,
      signOut,
      refresh,
      setUser,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider")
  }
  return context
}
