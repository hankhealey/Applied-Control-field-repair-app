import { Redis } from "@upstash/redis";

const kv = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

export interface PendingRequest {
  name: string;
  email: string;
  company: string;
  reason: string;
  expiresAt: number;
}

export interface KvUser {
  name: string;
  company: string;
  passwordHash: string;
  createdAt: number;
}

export interface UserSession {
  email: string;
  name: string;
  expiresAt: number;
}

// Shared AI extraction rules — one global set visible to every user
export interface SharedAIRule {
  id: string;
  text: string;
  createdAt: string;
}

const rk = (token: string) => `req:${token}`;
const uk = (email: string) => `user:${email.toLowerCase()}`;
const sk = (id: string) => `session:${id}`;
const AI_RULES_KEY = "ai-rules:global";

export const kvStore = {
  getRequest: (token: string) => kv.get<PendingRequest>(rk(token)),
  setRequest: (token: string, data: PendingRequest, exSeconds: number) =>
    kv.set(rk(token), data, { ex: exSeconds }),
  delRequest: (token: string) => kv.del(rk(token)),

  getUser: (email: string) => kv.get<KvUser>(uk(email)),
  setUser: (email: string, data: KvUser) => kv.set(uk(email), data),

  getSession: (id: string) => kv.get<UserSession>(sk(id)),
  setSession: (id: string, data: UserSession, exSeconds: number) =>
    kv.set(sk(id), data, { ex: exSeconds }),
  delSession: (id: string) => kv.del(sk(id)),

  getAIRules: () => kv.get<SharedAIRule[]>(AI_RULES_KEY),
  setAIRules: (rules: SharedAIRule[]) => kv.set(AI_RULES_KEY, rules),
};
