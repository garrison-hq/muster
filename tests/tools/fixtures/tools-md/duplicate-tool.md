## Overview

This file documents the tools available in the assistant environment.
Note: This file intentionally contains duplicate tool names to trigger the static error.

## Tools

The following tools are registered and available for use.

### send_email

Send an email to a recipient address with a subject and body.

#### Parameters

| Name      | Type   | Required |
|-----------|--------|----------|
| recipient | string | true     |
| subject   | string | true     |
| body      | string | false    |

### send_email

Send an email (duplicate entry — should trigger duplicate-tool-name lint error).

#### Parameters

| Name    | Type   | Required |
|---------|--------|----------|
| to      | string | true     |
| message | string | true     |
