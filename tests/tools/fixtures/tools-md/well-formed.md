## Overview

This file documents the tools available in the assistant environment.
All tools are stable and conform to the muster tools rubric.

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

### list_files

List files in a directory, optionally filtered by extension.

#### Parameters

| Name      | Type   | Required |
|-----------|--------|----------|
| directory | string | true     |
| extension | string | false    |
