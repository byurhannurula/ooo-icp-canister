import {
  $init,
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

const adminPrincipal: string = "2vxsx-fae";

type Member = Record<{
  id: string;
  name: string;
  email: string;
  availableDays: number;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type MemberPayload = Record<{
  name: string;
  email: string;
  availableDays?: number;
}>;

type Organization = Record<{
  id: string;
  name: string;
  members: Vec<string>;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type OrganizationPayload = Record<{
  name: string;
}>;

type Leave = Record<{
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type LeavePayload = Record<{
  startDate: string;
  endDate: string;
}>;

const leaveStorage = new StableBTreeMap<string, Leave>(0, 44, 1024);
const userStorage = new StableBTreeMap<string, Member>(1, 44, 1024);
const orgStorage = new StableBTreeMap<string, Organization>(2, 44, 1024);

let currentUser: any = {};
let currentOrg: any = {};

// ========================== ORG MANAGEMENT ===================================

$query;
export function getOrganization(id: string): Result<Organization, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Organization, string>(
      "Please enter valid Organization ID!",
    );
  }

  return match(orgStorage.get(id), {
    Some: (data) => Result.Ok<Organization, string>(data),
    None: () =>
      Result.Err<Organization, string>(
        `Organization with given id=${id} not found!`,
      ),
  });
}

$query;
export function getOrganizations(): Result<Vec<Organization>, string> {
  return Result.Ok<Vec<Organization>, string>(orgStorage.values());
}

$update;
export function createOrganization(
  payload: OrganizationPayload,
): Result<Organization, string> {
  const orgs = orgStorage.values();

  const isOrgExists = orgs.find((org) => org.name === payload.name);

  if (isOrgExists) {
    return Result.Err<Organization, string>(
      "Organization with given name exists already!",
    );
  }

  const org: Organization = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    members: [currentUser.id],
    ...payload,
  };

  orgStorage.insert(org.id, org);

  return Result.Ok<Organization, string>(org);
}

$update;
export function updateOrganization(
  id: string,
  payload: OrganizationPayload,
): Result<Organization, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Organization, string>(
      "Please enter valid Organization ID!",
    );
  }

  if (!isOrganizationAdmin()) {
    return Result.Err<Organization, string>(
      "You don't have access to update this organization!",
    );
  }

  return match(orgStorage.get(id), {
    Some: (org: Organization) => {
      const updatedOrg: Organization = {
        ...org,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };

      orgStorage.insert(org.id, updatedOrg);

      return Result.Ok<Organization, string>(updatedOrg);
    },
    None: () =>
      Result.Err<Organization, string>(
        `Could not update an Organization with the given id=${id}. Organization not found!`,
      ),
  });
}

$update;
export function deleteOrganization(id: string): Result<Organization, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Organization, string>(
      "Please enter valid Organization ID!",
    );
  }

  if (!isOrganizationAdmin()) {
    return Result.Err<Organization, string>(
      "You don't have access to delete this organization!",
    );
  }

  return match(orgStorage.remove(id), {
    Some: (deletedOrg) => Result.Ok<Organization, string>(deletedOrg),
    None: () =>
      Result.Err<Organization, string>(
        `Could not delete a Organization with the given id=${id}. Organization not found!`,
      ),
  });
}

// ========================= USER MANAGEMENT ===================================

$query;
export function getMember(id: string): Result<Member, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Member, string>("Please enter valid Member ID!");
  }

  return match(userStorage.get(id), {
    Some: (userData) => Result.Ok<Member, string>(userData),
    None: () =>
      Result.Err<Member, string>(`Member with given id=${id} not found!`),
  });
}

$query;
export function getMembers(): Result<Vec<Member>, string> {
  return Result.Ok<Vec<Member>, string>(userStorage.values());
}

$update;
export function addMember(payload: MemberPayload): Result<Member, string> {
  const users = userStorage.values();

  const isMemberExists = users.find((user) => user.email === payload.email);

  if (isMemberExists) {
    return Result.Err<Member, string>(
      "Member with given email address exists already!",
    );
  }

  const user: Member = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    availableDays: DEFAULT_AVAILABLE_DAYS,
    ...payload,
  };

  userStorage.insert(user.id, user);

  orgStorage.get(currentOrg.id);
  return Result.Ok<Member, string>(user);
}

$update;
export function updateMember(
  id: string,
  payload: MemberPayload,
): Result<Member, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Member, string>("Please enter valid Member ID!");
  }

  return match(userStorage.get(id), {
    Some: (user) => {
      const updatedMember: Member = {
        ...user,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };

      userStorage.insert(user.id, updatedMember);

      return Result.Ok<Member, string>(updatedMember);
    },
    None: () =>
      Result.Err<Member, string>(
        `Could not update a user with the given id=${id}. Member not found!`,
      ),
  });
}

$update;
export function deleteMember(id: string): Result<Member, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Member, string>("Please enter valid Member ID!");
  }

  return match(userStorage.remove(id), {
    Some: (deletedMember) => Result.Ok<Member, string>(deletedMember),
    None: () =>
      Result.Err<Member, string>(
        `Could not delete a Member with the given id=${id}. Member not found!`,
      ),
  });
}

// ========================= LEAVE MANAGEMENT ==================================

$update;
export function requestLeave(
  userId: string,
  payload: LeavePayload,
): Result<Leave, string> {
  if (!isValidUUID(userId)) {
    return Result.Err<Leave, string>("Please enter valid Member ID!");
  }

  const user = getMember(userId);

  if (!user.Ok || user.Err) {
    return Result.Err<Leave, string>(
      "Could not find the Member with the given ID!",
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

  const leaves = leaveStorage.values();
  const currentMembersLeaves = leaves.filter(
    (leave) => leave.userId === userId,
  );

  if (currentMembersLeaves.length) {
    currentMembersLeaves.forEach((currentLeave) => {
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
    status: LeaveStatuses.APPROVED,
    days: diffDays,
    ...payload,
  };

  leaveStorage.insert(leave.id, leave);

  updateMembersAvailableDays(leave.userId, leave.days, "SUBTRACT");

  return Result.Ok<Leave, string>(leave);
}

$update;
export function updateLeave(
  id: string,
  payload: LeavePayload,
): Result<Leave, string> {
  if (!isValidUUID(id)) {
    return Result.Err<Leave, string>("Please enter valid Leave ID!");
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
        updateMembersAvailableDays(leave.userId, leave.days, "ADD");
      }

      return Result.Ok<Leave, string>(updatedLeave);
    },
    None: () =>
      Result.Err<Leave, string>(
        `Could not update status of the leave with the given id=${id}. Leave not found!`,
      ),
  });
}

// ========================= AUTH MANAGEMENT ===================================

$query;
export function login(email: string): Result<Member, string> {
  const user = userStorage.values().find((user) => user.email === email);

  if (user) {
    currentUser = { ...user };

    const org = orgStorage.values().find((x) => x.members.includes(user?.id));
    currentOrg = { ...org };

    return Result.Ok<Member, string>(user);
  } else {
    return Result.Err<Member, string>(
      `Could not find user with given email. Please try again!`,
    );
  }
}

$update;
export function register(payload: MemberPayload): Result<Member, string> {
  const users = userStorage.values();

  const isMemberExists = users.find((user) => user.email === payload.email);

  if (isMemberExists) {
    return Result.Err<Member, string>(
      "User with given email address exists already!",
    );
  }

  const user: Member = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    availableDays: DEFAULT_AVAILABLE_DAYS,
    ...payload,
  };

  userStorage.insert(user.id, user);

  return Result.Ok<Member, string>(user);
}

// ============================= HELPERS =======================================

function updateMembersAvailableDays(
  userId: string,
  leaveDays: number,
  operation: "ADD" | "SUBTRACT",
): Result<Member, string> {
  if (!isValidUUID(userId)) {
    return Result.Err<Member, string>("Please enter valid Member ID!");
  }

  const user = getMember(userId);

  if (!user || !user.Ok || !user.Ok.availableDays) {
    return Result.Err<Member, string>(
      `Could not update status of the leave with the given id=${userId}. Something went wrong!`,
    );
  }

  let availableDays = user.Ok?.availableDays;
  if (operation === "ADD") {
    availableDays = user.Ok?.availableDays + leaveDays;
  } else if (operation === "SUBTRACT") {
    availableDays = user.Ok?.availableDays - leaveDays;
  }

  return updateMember(userId, {
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

function isOrganizationAdmin(): boolean {
  return ic.caller().toString() !== adminPrincipal;
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
