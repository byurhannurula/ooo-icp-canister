# ooo-icp-canister

> **OOO (Out Of Office) - is a simple platform for managing leaves of the employees.**

## Setup

1. Install dfx using `DFX_VERSION=0.14.1 sh -ci "$(curl -fsSL https://sdk.dfinity.org/install.sh)"`
2. Add it to your PATH variables using `echo 'export PATH="$PATH:$HOME/bin"' >> "$HOME/.bashrc"`
3. Next, `run dfx start --background`
4. Then run `dfx deploy`. It will take a while
5. A link will be generated. Go to that link and test all the functions


### Methods
- **User**
  - Add User - `addUser`
  - Delete User - `deleteUser`
  - Update User - `updateUser`
  - Get User By ID - `getUser`
  - Get all Users - `getUsers`

- **Leaves**
  - Request Leave - `requestLeave`
  - Update Leave - `updateLeave`
  - Delete Leave - `deleteLeave`
  - Update Leave Status - `updateLeaveStatus`
  - Get all Leaves Request - `getLeaveRequest`
  - Get Leaves Request By Status - `getLeaveRequestByStatus`

