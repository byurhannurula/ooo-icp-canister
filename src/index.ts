import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
} from "azle";
import { v4 as uuidv4, validate as isValidUUID } from "uuid";

const DEFAULT_AVAILABLE_DAYS = 21;

enum LeaveStatus {
  PENDING,
  APPROVED,
  REJECTED,
}

type User = Record<{
  id: string;
  name: string;
  email: string;
  availableDays: number;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type UserPayload = Record<{
  name: string;
  email: string;
  availableDays?: number;
}>;

type Leave = Record<{
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type LeavePayload = Record<{
  startDate: string;
  endDate: string;
}>;

const usersStorage = new StableBTreeMap<string, User>(0, 44, 1024);
const leavesStorage = new StableBTreeMap<string, Leave>(0, 44, 1024);

// ========================= LEAVE MANAGEMENT ==================================

$update;
export function requestLeave(
  userId: string,
  payload: LeavePayload,
): Result<Leave, string> {
  if (!isValidUUID(userId)) {
    return Result.Err<Leave, string>("Please enter valid User ID!");
  }

  const user = getUser(userId);

  if (!user.Ok || user.Err) {
    return Result.Err<Leave, string>(
      "Could not find the User with the given ID!",
    );
  }

  const { startDate, endDate } = payload;

  const currentYear = new Date().getFullYear();
  const startDateObject = new Date(startDate);
  const endDateObject = new Date(endDate);

  const diffDays = findDiffInDays(payload.startDate, payload.endDate);

  if (diffDays <= 0) {
    return Result.Err<Leave, string>("Leave should be atleast one day!");
  }

  // Check if user has enough available days left
  if (user.Ok.availableDays < diffDays) {
    return Result.Err<Leave, string>("Leave should be atleast one day!");
  }

  // Check if requested leave period is in this year
  if (
    startDateObject.getFullYear() > currentYear ||
    endDateObject.getFullYear() > currentYear ||
    startDateObject.getFullYear() < currentYear ||
    endDateObject.getFullYear() < currentYear
  ) {
    return Result.Err<Leave, string>(
      "Leave period should be in the current calendar year!",
    );
  }

  if (timestampToDate(startDate) < timestampToDate(endDate)) {
    return Result.Err<Leave, string>("Leave should be atleast one day!");
  }

  const leaves = leavesStorage.values();
  const currentUsersLeaves = leaves.filter((leave) => leave.userId === userId);

  if (currentUsersLeaves.length) {
    currentUsersLeaves.forEach((currentLeave) => {
      if (
        (currentLeave.startDate <= startDate &&
          startDate <= currentLeave.endDate) ||
        (currentLeave.startDate <= endDate &&
          endDate <= currentLeave.endDate) ||
        (currentLeave.startDate >= startDate && endDate >= currentLeave.endDate)
      ) {
        return Result.Err<Leave, string>(
          "The chosen leave period overlaps with an existing leave!",
        );
      }
    });
  }

  const leave: Leave = {
    id: uuidv4(),
    userId,
    createdAt: ic.time(),
    updatedAt: Opt.None,
    status: LeaveStatus.PENDING,
    days: diffDays,
    ...payload,
  };

  leavesStorage.insert(leave.id, leave);

  updateUsersAvailableDays(leave.userId, leave.days, "SUBTRACT");

  return Result.Ok(leave);
}

$update;
export function updateLeave(
  id: string,
  payload: LeavePayload,
): Result<Leave, string> {
  return match(leavesStorage.get(id), {
    Some: (leave) => {
      const diffDays = findDiffInDays(payload.startDate, payload.endDate);

      if (diffDays <= 0) {
        return Result.Err<Leave, string>("Leave should be atleast one day!");
      }

      const updatedLeave: Leave = {
        ...leave,
        ...payload,
        days: diffDays,
        updatedAt: Opt.Some(ic.time()),
      };

      leavesStorage.insert(leave.id, updatedLeave);

      return Result.Ok<Leave, string>(updatedLeave);
    },
    None: () =>
      Result.Err<Leave, string>(
        `Could not update leave with the given id=${id}. Leave not found!`,
      ),
  });
}

$update;
export function updateLeaveStatus(
  id: string,
  status: LeaveStatus,
): Result<Leave, string> {
  return match(leavesStorage.get(id), {
    Some: (leave) => {
      const updatedLeave: Leave = {
        ...leave,
        status: status,
        updatedAt: Opt.Some(ic.time()),
      };

      leavesStorage.insert(leave.id, updatedLeave);

      if (status === LeaveStatus.REJECTED) {
        updateUsersAvailableDays(leave.userId, leave.days, "ADD");
      }

      return Result.Ok<Leave, string>(updatedLeave);
    },
    None: () =>
      Result.Err<Leave, string>(
        `Could not update status of the leave with the given id=${id}. Leave not found!`,
      ),
  });
}

// ========================= USER MANAGEMENT ===================================

$query;
export function getUser(id: string): Result<User, string> {
  return match(usersStorage.get(id), {
    Some: (userData) => Result.Ok<User, string>(userData),
    None: () => Result.Err<User, string>(`User with given id=${id} not found!`),
  });
}

$query;
export function getUsers(): Result<Vec<User>, string> {
  return Result.Ok(usersStorage.values());
}

$update;
export function addUser(payload: UserPayload): Result<User, string> {
  const users = usersStorage.values();

  const isUserExists = users.find((user) => user.email === payload.email);

  if (isUserExists) {
    return Result.Err<User, string>(
      "User with given email address exists already!!",
    );
  }

  const user: User = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    availableDays: DEFAULT_AVAILABLE_DAYS,
    ...payload,
  };

  usersStorage.insert(user.id, user);

  return Result.Ok(user);
}

$update;
export function updateUser(
  id: string,
  payload: UserPayload,
): Result<User, string> {
  return match(usersStorage.get(id), {
    Some: (user) => {
      const updatedUser: User = {
        ...user,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };

      usersStorage.insert(user.id, updatedUser);

      return Result.Ok<User, string>(updatedUser);
    },
    None: () =>
      Result.Err<User, string>(
        `Could not update a user with the given id=${id}. User not found!`,
      ),
  });
}

$update;
export function deleteUser(id: string): Result<User, string> {
  return match(usersStorage.remove(id), {
    Some: (deletedUser) => Result.Ok<User, string>(deletedUser),
    None: () =>
      Result.Err<User, string>(
        `Could not delete a User with the given id=${id}. User not found!`,
      ),
  });
}

function updateUsersAvailableDays(
  userId: string,
  leaveDays: number,
  operation: "ADD" | "SUBTRACT",
) {
  const user = getUser(userId);

  if (!user || !user.Ok || !user.Ok.availableDays) {
    return Result.Err<Leave, string>(
      `Could not update status of the leave with the given id=${userId}. Something went wrong!`,
    );
  }

  let availableDays = user.Ok?.availableDays;
  if (operation === "ADD") {
    availableDays = user.Ok?.availableDays + leaveDays;
  } else if (operation === "SUBTRACT") {
    availableDays = user.Ok?.availableDays - leaveDays;
  }

  updateUser(userId, {
    ...user.Ok,
    availableDays: availableDays,
  });
}

function findDiffInDays(startDate: string, endDate: string): number {
  const diffTime = new Date(endDate).getDate() - new Date(startDate).getDate();

  return diffTime;
}

function timestampToDate(value: string | number): string {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  // @ts-ignore
  getRandomValues: () => {
    const array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};
