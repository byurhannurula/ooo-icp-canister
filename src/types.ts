import { Record, Opt, nat64, Principal } from "azle";

export type User = Record<{
  id: Principal;
  name: string;
  email: string;
  isActive: boolean;
  isAdmin: boolean;
  availableDays: number;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

export type UserPayload = Record<{
  id?: Principal;
  name?: string;
  email?: string;
  isActive?: boolean;
  isAdmin?: boolean;
  availableDays?: number;
}>;

export type PromoteUserPayload = Record<{
  id: Principal;
  isAdmin?: boolean;
  isActive?: boolean;
}>;

export type CreateOrEditUserPayload = Record<{
  name: string;
  email: string;
}>;

export type Leave = Record<{
  id: string;
  userId: Principal;
  startDate: number;
  endDate: number;
  days: number;
  status: string;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

export type LeavePayload = Record<{
  startDate: number;
  endDate: number;
}>;
