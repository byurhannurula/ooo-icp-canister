# ooo-icp-canister

> **OOO (Out Of Office) - is a simple self-hosted solution for managing leaves of the employees.**



## Setup

1. Install dfx using `DFX_VERSION=0.14.1 sh -ci "$(curl -fsSL https://sdk.dfinity.org/install.sh)"`
2. Add it to your PATH variables using `echo 'export PATH="$PATH:$HOME/bin"' >> "$HOME/.bashrc"`
3. Next, `run dfx start --background`
4. Then run `dfx deploy`. It will take a while
5. A link will be generated. Go to that link and test all the functions


### Methods
- **User**
  - Get all Users - `getUsers`
  - Get User By ID - `getUser`
  - Add User (first user is the admin) - `createUser`
  - Update User (update user profile - name, email) - `updateUser`
  - Activate or Deactivate account or promote it as admin - `promoteUser`

- **Leaves**
  - Request leave - `requestLeave`
  - Update leave period - `updateLeave`
  - Update leave status - `updateLeaveStatus`
  - Delete leave if it's still in status "PENDING" - `deleteLeave`
  - Get leaves request By status - `getMyLeaveRequestsByStatus`
  - Get all of my leaves request - `getMyLeaveRequests`

