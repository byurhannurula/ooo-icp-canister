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

const LeaveStatuses = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

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
  startDate: number;
  endDate: number;
  days: number;
  status: string;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type LeavePayload = Record<{
  startDate: number;
  endDate: number;
}>;

const leaveStorage = new StableBTreeMap<string, Leave>(0, 44, 1024);
const userStorage = new StableBTreeMap<string, User>(1, 44, 1024);

// ========================= USER MANAGEMENT ===================================

$query;
export function getUser(id: string): Result<User, string> {
  if (!isValidUUID(id)) {
    return Result.Err<User, string>("Please enter valid User ID!");
  }

  return match(userStorage.get(id), {
    Some: (userData) => Result.Ok<User, string>(userData),
    None: () => Result.Err<User, string>(`User with given id=${id} not found!`),
  });
}

$query;
export function getUsers(): Result<Vec<User>, string> {
  return Result.Ok<Vec<User>, string>(userStorage.values());
}

$update;
export function addUser(payload: UserPayload): Result<User, string> {
  if (!payload.name || !payload.email) {
    return Result.Err(
      "Name and Email data are required! Please enter valid data.",
    );
  }

  const users = userStorage.values();
  const isUserExists = users.find((user) => user.email === payload.email);

  if (isUserExists) {
    return Result.Err<User, string>(
      "User with given email address exists already!",
    );
  }

  if (
    !payload.availableDays ||
    (payload.availableDays && typeof payload.availableDays !== "number")
  ) {
    payload.availableDays = DEFAULT_AVAILABLE_DAYS;
  }

  const user: User = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    ...payload,
    availableDays: payload.availableDays ?? DEFAULT_AVAILABLE_DAYS,
  };

  userStorage.insert(user.id, user);

  return Result.Ok<User, string>(user);
}

$update;
export function updateUser(
  id: string,
  payload: UserPayload,
): Result<User, string> {
  if (!isValidUUID(id)) {
    return Result.Err<User, string>("Please enter valid User ID!");
  }

  if (!payload.name || !payload.email) {
    return Result.Err(
      "Name and Email cannot be empty! Please enter valid data.",
    );
  }

  return match(userStorage.get(id), {
    Some: (user) => {
      const updatedUser: User = {
        ...user,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };

      userStorage.insert(user.id, updatedUser);

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
  if (!isValidUUID(id)) {
    return Result.Err<User, string>("Please enter valid User ID!");
  }

  return match(userStorage.remove(id), {
    Some: (deletedUser) => Result.Ok<User, string>(deletedUser),
    None: () =>
      Result.Err<User, string>(
        `Could not delete a User with the given id=${id}. User not found!`,
      ),
  });
}

// ========================= LEAVE MANAGEMENT ==================================

$query;
export function getLeaveRequests(): Result<Vec<Leave>, string> {
  return Result.Ok<Vec<Leave>, string>(leaveStorage.values());
}

$query;
export function getUsersLeaveRequests(
  userId: string,
): Result<Vec<Leave>, string> {
  if (!isValidUUID(userId)) {
    return Result.Err("Please enter valid User ID!");
  }

  return Result.Ok(
    leaveStorage.values().filter(({ userId }) => userId === userId),
  );
}

$query;
export function getLeaveRequestsByStatus(
  status: string,
): Result<Vec<Leave>, string> {
  if (!status || (status && !Object.values(LeaveStatuses).includes(status))) {
    return Result.Err(
      "Please enter valid Status! Statuses are - PENDING, APPROVED and REJECTED",
    );
  }

  return Result.Ok(
    leaveStorage.values().filter((leave) => leave.status === status),
  );  
}

$update;
export function requestLeave(
  userId: string,
  payload: LeavePayload,
): Result<Leave, string> {
  if (!isValidUUID(userId)) {
    return Result.Err("Please enter valid User ID!");
  }

  const user = getUser(userId);

  if (!user.Ok || user.Err) {
    return Result.Err<Leave, string>(
      "Could not find the User with the given ID!",
    );
  }

  const { startDate, endDate } = payload;

  if (startDate >= endDate) {
    return Result.Err("Start date must be before end date!");
  }

  const currentYear = new Date().getFullYear();
  const startDateObject = new Date(startDate);
  const endDateObject = new Date(endDate);

  const diffDays = findDiffInDays(payload.startDate, payload.endDate);

  if (diffDays === 0) {
    return Result.Err("Leave should be atleast one day!");
  }

  // Check if user has enough available days left
  if (user.Ok.availableDays < diffDays) {
    return Result.Err("You are exceeding your available days for leave!");
  }

  // Check if requested leave period is in this year
  if (
    startDateObject.getFullYear() > currentYear ||
    endDateObject.getFullYear() > currentYear ||
    startDateObject.getFullYear() < currentYear ||
    endDateObject.getFullYear() < currentYear
  ) {
    return Result.Err("Leave period should be in the current calendar year!");
  }

  const leaves = leaveStorage
    .values()
    .filter((leave) => leave.userId === userId);

  if (leaves.length) {
    leaves.forEach((currentLeave) => {
      if (
        (currentLeave.startDate <= startDate &&
          startDate <= currentLeave.endDate) ||
        (currentLeave.startDate <= endDate &&
          endDate <= currentLeave.endDate) ||
        (currentLeave.startDate >= startDate && endDate >= currentLeave.endDate)
      ) {
        return Result.Err(
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
    status: LeaveStatuses.PENDING,
    days: diffDays,
    ...payload,
  };

  leaveStorage.insert(leave.id, leave);

  updateUsersAvailableDays(leave.userId, leave.days, "SUBTRACT");

  return Result.Ok(leave);
}

$update;
export function updateLeave(
  id: string,
  payload: LeavePayload,
): Result<Leave, string> {
  if (!isValidUUID(id)) {
    return Result.Err("Please enter valid Leave ID!");
  }

  return match(leaveStorage.get(id), {
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

      leaveStorage.insert(leave.id, updatedLeave);

      return Result.Ok<Leave, string>(updatedLeave);
    },
    None: () =>
      Result.Err<Leave, string>(
        `Could not update leave with the given id=${id}. Leave not found!`,
      ),
  });
}

$update;
export function deleteLeave(id: string): Result<Leave, string> {
  if (!isValidUUID(id)) {
    return Result.Err("Please enter valid Leave ID!");
  }

  return match(leaveStorage.remove(id), {
    Some: (deletedLeave) => Result.Ok<Leave, string>(deletedLeave),
    None: () =>
      Result.Err<Leave, string>(
        `Could not delete a Leave with the given id=${id}. Leave not found!`,
      ),
  });
}

$update;
export function updateLeaveStatus(
  id: string,
  status: string,
): Result<Leave, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Leave, string>("Please enter valid Leave ID!");
  }

  return match(leaveStorage.get(id), {
    Some: (leave) => {
      const updatedLeave: Leave = {
        ...leave,
        status: status,
        updatedAt: Opt.Some(ic.time()),
      };

      leaveStorage.insert(leave.id, updatedLeave);

      if (status === LeaveStatuses.REJECTED) {
        updateUsersAvailableDays(leave.userId, leave.days, "ADD");
      } else {
        updateUsersAvailableDays(leave.userId, leave.days, "SUBTRACT");
      }

      return Result.Ok<Leave, string>(updatedLeave);
    },
    None: () =>
      Result.Err<Leave, string>(
        `Could not update status of the leave with the given id=${id}. Leave not found!`,
      ),
  });
}

// ============================= HELPERS =======================================

function updateUsersAvailableDays(
  userId: string,
  leaveDays: number,
  operation: "ADD" | "SUBTRACT",
): Result<User, string> {
  if (!isValidUUID(userId)) {
    return Result.Err("Please enter valid User ID!");
  }

  const user = getUser(userId);

  if (!user || !user.Ok || !user.Ok.availableDays) {
    return Result.Err(
      `Could not update status of the leave with the given id=${userId}. Something went wrong!`,
    );
  }

  let availableDays = user.Ok?.availableDays;
  if (operation === "ADD") {
    availableDays = user.Ok?.availableDays + leaveDays;
  } else if (operation === "SUBTRACT") {
    availableDays = user.Ok?.availableDays - leaveDays;
  }

  return updateUser(userId, {
    ...user.Ok,
    availableDays: availableDays,
  });
}

function findDiffInDays(startDate: number, endDate: number): number {
  const oneDay = 24 * 60 * 60 * 1000; // hours * minutes * seconds * milliseconds
  const diffDays = Math.round(Math.abs((endDate - startDate) / oneDay));

  return diffDays === 0 ? 1 : diffDays;
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
