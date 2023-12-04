import {
  $query,
  $update,
  StableBTreeMap,
  Vec,
  match,
  Result,
  ic,
  Opt,
  Principal,
} from "azle";
import { v4 as uuidv4, validate as isValidUUID } from "uuid";

import { findDiffInDays, isValidEmail } from "./utils";
import { DEFAULT_AVAILABLE_DAYS, LeaveStatuses } from "./constants";
import {
  User,
  Leave,
  UserPayload,
  LeavePayload,
  PromoteUserPayload,
  CreateOrEditUserPayload,
} from "./types";

const leaveStorage = new StableBTreeMap<string, Leave>(0, 44, 1024);
const userStorage = new StableBTreeMap<Principal, User>(1, 44, 1024);

// ========================= USER MANAGEMENT ===================================

/**
 * Get user by id
 * @param id - ID of user.
 * @returns user instance.
 */

$query;
export function getUser(id: Principal): Result<User, string> {
  return match(userStorage.get(id), {
    Some: (userData) => Result.Ok<User, string>(userData),
    None: () => Result.Err<User, string>(`User with given id=${id} not found!`),
  });
}

/**
 * Get all users
 * @returns array of user instances.
 */

$query;
export function getUsers(): Result<Vec<User>, string> {
  if (!isAdmin()) {
    return Result.Err("You do not have the permission for this operation!");
  }

  return Result.Ok(userStorage.values());
}

/**
 * Creates a new user. First created user is admin of the company
 * @param name - Name for the user.
 * @param email - Email for the user.
 * @returns the newly created user instance.
 */

$update;
export function createUser(
  payload: CreateOrEditUserPayload,
): Result<User, string> {
  if (!payload || !payload.name || !payload.email) {
    return Result.Err(
      "Name and Email data are required! Please enter valid data.",
    );
  }

  if (!isValidEmail(payload.email)) {
    return Result.Err("Incorrect email! Please enter valid email.");
  }

  const isUserExists = userStorage
    .values()
    .find((user) => user.email === payload.email);

  if (isUserExists) {
    return Result.Err("User with given email address exists already!");
  }

  const { name, email } = payload;

  const user: User = {
    name,
    email,
    id: ic.caller(),
    createdAt: ic.time(),
    updatedAt: Opt.Some(ic.time()),
    isActive: userStorage.isEmpty(),
    isAdmin: userStorage.isEmpty(),
    availableDays: DEFAULT_AVAILABLE_DAYS,
  };

  userStorage.insert(user.id, user);

  return Result.Ok(user);
}

/**
 * Promote user. Excluding admin all of the users are not active by default so admin should approve them also can promote if needed
 * @param id - ID (Principal) for the user.
 * @param isAdmin - Admin status for the user (optional).
 * @param isActive - Account status for the user (optional).
 * @returns the updated user instance.
 */

$update;
export function promoteUser(payload: PromoteUserPayload): Result<User, string> {
  if (!isAdmin()) {
    return Result.Err("You do not have the permission for this operation!");
  }

  if (!payload || !payload.id || userStorage.get(payload.id).None) {
    return Result.Err<User, string>(
      `Could not update a user with the given id=${payload?.id}. User not found!`,
    );
  }

  if (payload.id === ic.caller()) {
    return Result.Err("You can't edit yourself!");
  }

  if (payload.isAdmin) {
    payload.isActive = true;
  }

  if (payload.isActive === false) {
    payload.isAdmin = false;
  }

  return updateUserParams({
    id: payload.id,
    isAdmin: payload.isAdmin,
    isActive: payload.isActive,
  });
}

/**
 * Update user info. Users can update theid info like profile info.
 * @param name - Name for the user.
 * @param email - Email for the user.
 * @returns the newly updated user instance.
 */

$update;
export function updateUser(
  payload: CreateOrEditUserPayload,
): Result<User, string> {
  if (!payload || (!payload.name && !payload.email)) {
    return Result.Err(
      "Name and Email cannot be empty! Please enter valid data.",
    );
  }

  return updateUserParams({
    id: ic.caller(),
    name: payload.name,
    email: payload.email,
  });
}

// ========================= LEAVE MANAGEMENT ==================================

/**
 * Get current user's leave requests..
 * @returns all of the leave requests of user.
 */

$query;
export function getMyLeaveRequests(): Result<Vec<Leave>, string> {
  if (!isActive()) {
    return Result.Err(
      "Your account has not been activated yet! Please contact support for account confirmation.",
    );
  }

  return Result.Ok(
    leaveStorage
      .values()
      .filter((x) => x.userId.toString() === ic.caller().toString()),
  );
}

/**
 * Get current user's leave requests by status.
 * @param status - Status of the requests - PENDING, REJECTED, ACCEPTED.
 * @returns the leave requests with the given status.
 */

$query;
export function getMyLeaveRequestsByStatus(
  status: string,
): Result<Vec<Leave>, string> {
  if (!isActive()) {
    return Result.Err(
      "Your account has not been activated yet! Please contact support for account confirmation.",
    );
  }

  if (!status || (status && !Object.values(LeaveStatuses).includes(status))) {
    return Result.Err(
      "Please enter valid Status! Statuses are - PENDING, APPROVED and REJECTED",
    );
  }

  return Result.Ok(
    leaveStorage
      .values()
      .filter((x) => x.userId.toString() === ic.caller().toString()),
  );
}

/**
 * Request leave.
 * @param startDate - start date of the leave in timestamp.
 * @param endDate - end date of the leave in timestamp.
 * @returns the leave request instance.
 */

$update;
export function requestLeave(payload: LeavePayload): Result<Leave, string> {
  const userId = ic.caller();
  const user = userStorage.get(userId);

  if (!user.Some || user.None) {
    return Result.Err<Leave, string>(
      "Could not find the User with the given ID!",
    );
  }

  if (!isActive()) {
    return Result.Err(
      "Your account has not been activated yet! Please contact support for account confirmation.",
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
  if (user.Some.availableDays < diffDays) {
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

/**
 * Update leave request dates/period.
 * @param id - ID of the leave.
 * @param startDate - start date of the leave in timestamp.
 * @param endDate - end date of the leave in timestamp.
 * @returns the updated leave request instance.
 */

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
      if (leave.userId !== ic.caller()) {
        return Result.Err<Leave, string>(
          "You do not have the permission for this operation!",
        );
      }

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

/**
 * Delete leave request only if it's still in pending.
 * @param id - ID of the leave.
 * @returns the deleted leave request instance.
 */

$update;
export function deleteLeave(id: string): Result<Leave, string> {
  if (!isValidUUID(id)) {
    return Result.Err("Please enter valid Leave ID!");
  }

  const leave = leaveStorage.get(id);

  if (!leave.Some || leave.None || leave.Some.status === "ACCEPTED") {
    return Result.Err(
      "Leave is already accepted so you can't delete/cancel leave!",
    );
  }

  return match(leaveStorage.remove(id), {
    Some: (deletedLeave) => {
      if (deletedLeave.status === LeaveStatuses.PENDING) {
        updateUsersAvailableDays(deletedLeave.userId, deletedLeave.days, "ADD");
      }

      return Result.Ok<Leave, string>(deletedLeave);
    },
    None: () =>
      Result.Err<Leave, string>(
        `Could not delete a Leave with the given id=${id}. Leave not found!`,
      ),
  });
}

/**
 * Update leave request's status.
 * @param id - ID of the leave.
 * @param status - Status of the requests - PENDING, REJECTED, ACCEPTED.
 * @returns the updated leave request instance.
 */

$update;
export function updateLeaveStatus(
  id: string,
  status: string,
): Result<Leave, string> {
  if (!isAdmin()) {
    return Result.Err("You do not have the permission for this operation!");
  }

  if (!isValidUUID(id)) {
    return Result.Err("Please enter valid Leave ID!");
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
  userId: Principal,
  leaveDays: number,
  operation: "ADD" | "SUBTRACT",
): Result<User, string> {
  const user = userStorage.get(userId);

  if (!user || !user.Some || !user.Some.availableDays) {
    return Result.Err(
      `Could not update status of the leave with the given id=${userId}. Something went wrong!`,
    );
  }

  let availableDays = user.Some?.availableDays;
  if (operation === "ADD") {
    availableDays = user.Some?.availableDays + leaveDays;
  } else if (operation === "SUBTRACT") {
    availableDays = user.Some?.availableDays - leaveDays;
  }

  return updateUserParams({ id: userId, availableDays: availableDays });
}

function updateUserParams(payload: UserPayload): Result<User, string> {
  if (!payload || !payload.id) {
    return Result.Err("ID cannot be empty! Please enter valid data.");
  }

  return match(userStorage.get(payload.id), {
    Some: (user) => {
      const updatedUser: User = {
        ...user,
        updatedAt: Opt.Some(ic.time()),
      };

      if (payload.availableDays) {
        updatedUser.availableDays = payload.availableDays;
      }

      if (payload.isActive) {
        updatedUser.isActive = payload.isActive;
      }

      if (payload.isAdmin) {
        updatedUser.isAdmin = payload.isAdmin;
      }

      if (payload.name) {
        updatedUser.name = payload.name;
      }

      if (payload.email) {
        if (!isValidEmail(payload.email)) {
          return Result.Err<User, string>(
            "Incorrect email! Please enter valid email.",
          );
        }

        const isUserExists = userStorage
          .values()
          .find((user) => user.email === payload.email);

        if (isUserExists) {
          return Result.Err<User, string>(
            "User with given email address exists already!",
          );
        }

        updatedUser.email = payload.email;
      }

      userStorage.insert(user.id, updatedUser);

      return Result.Ok<User, string>(updatedUser);
    },
    None: () =>
      Result.Err<User, string>(
        `Could not update a user with the given id=${payload.id}. User not found!`,
      ),
  });
}

function isAdmin(): boolean {
  const user = userStorage.get(ic.caller());

  if (!user.Some || user.None || !user.Some.isAdmin) {
    return false;
  }

  return true;
}

function isActive(): boolean {
  const user = userStorage.get(ic.caller());

  if (!user.Some || user.None || !user.Some.isActive) {
    return false;
  }

  return true;
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
