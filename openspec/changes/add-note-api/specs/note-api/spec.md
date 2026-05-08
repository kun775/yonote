## ADDED Requirements
### Requirement: Read Note By Key API
The system SHALL provide a JSON API to read a note by key.

#### Scenario: Read existing unprotected note
- **WHEN** a client sends `GET /api/notes/:key` for an existing note without password protection
- **THEN** the system SHALL return HTTP 200 with `status` and a single `note` object containing the key, decrypted content, public flag, password flag, encrypted flag, created timestamp, and updated timestamp

#### Scenario: Read publicly protected note without password
- **WHEN** a client sends `GET /api/notes/:key` for an existing note with password protection and `public` enabled
- **THEN** the system SHALL return HTTP 200 with `status` and a single `note` object containing the key, decrypted content, public flag, password flag, encrypted flag, created timestamp, and updated timestamp

#### Scenario: Read missing note
- **WHEN** a client sends `GET /api/notes/:key` for a note that does not exist
- **THEN** the system SHALL return HTTP 404 with a JSON error response

#### Scenario: Reject invalid key
- **WHEN** a client sends `GET /api/notes/:key` with an invalid key
- **THEN** the system SHALL return HTTP 400 with a JSON error response

#### Scenario: Read private protected note with password header
- **WHEN** a client sends `GET /api/notes/:key` for a password-protected non-public note with a valid `x-admin-auth` header
- **THEN** the system SHALL return HTTP 200 with `status` and a single `note` object containing the key, decrypted content, public flag, password flag, encrypted flag, created timestamp, and updated timestamp

#### Scenario: Reject private protected note without password header
- **WHEN** a client sends `GET /api/notes/:key` for a password-protected non-public note without a valid `x-admin-auth` header
- **THEN** the system SHALL return HTTP 403 with a JSON error response

### Requirement: Write Note By Key API
The system SHALL provide a JSON API to write note content by key.

#### Scenario: Write new note
- **WHEN** a client sends `POST /api/notes/:key` with JSON body containing `content` for a note that does not exist
- **THEN** the system SHALL create the note, encrypt the content, persist it, and return HTTP 200 with success status and timestamps

#### Scenario: Update existing note
- **WHEN** a client sends `POST /api/notes/:key` with JSON body containing `content` for an existing note without password protection
- **THEN** the system SHALL encrypt and persist the new content and return HTTP 200 with success status and timestamps

#### Scenario: Append existing note
- **WHEN** a client sends `POST /api/notes/:key` with JSON body containing `content` and `append: true`
- **THEN** the system SHALL append the submitted content to the existing decrypted content, encrypt and persist the combined content, and return HTTP 200 with success status and timestamps

#### Scenario: Create protected note
- **WHEN** a client sends `POST /api/notes/:key` with JSON body containing `content` and `password` for a note that does not exist
- **THEN** the system SHALL create the note, store the encrypted content, store the password hash, set `public` to false by default, and return HTTP 200 with success status and timestamps

#### Scenario: Create publicly protected note
- **WHEN** a client sends `POST /api/notes/:key` with JSON body containing `content`, `password`, and `public: true` for a note that does not exist
- **THEN** the system SHALL create the note, store the encrypted content, store the password hash, set `public` to true, and return HTTP 200 with success status and timestamps

#### Scenario: Update protected note with password header
- **WHEN** a client sends `POST /api/notes/:key` for a password-protected note with a valid `x-admin-auth` header
- **THEN** the system SHALL update the note according to the request body and return HTTP 200 with success status and timestamps

#### Scenario: Reject invalid payload
- **WHEN** a client sends `POST /api/notes/:key` without a string `content` field
- **THEN** the system SHALL return HTTP 400 with a JSON error response

#### Scenario: Reject protected write without password header
- **WHEN** a client sends `POST /api/notes/:key` for a password-protected note without a valid `x-admin-auth` header
- **THEN** the system SHALL return HTTP 403 with a JSON error response
