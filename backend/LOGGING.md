# Backend Logging

This backend uses structured JSON logging.

Every log line includes:

- `timestamp`
- `level`
- `message`
- `service`
- component-specific fields such as `requestId`, `auth0Id`, `topic`, `roomId`, `mode`, counts, moderation details, and serialized errors

## Defaults

- Default: `warn`
- `warn`, `error`, and `fatal` go to stderr
- `info` and `debug` go to stdout

## Environment Controls

- `LOG_LEVEL=` sets an explicit minimum level: `debug`, `info`, `warn`, `error`, `fatal`
- `DB_PING_INTERVAL_MS=30000` controls how often the backend pings MongoDB after startup

If `LOG_LEVEL` is blank, the code uses the built-in defaults above.

## Tier Policy

- `fatal`: startup failures and process-level hard failures
- `error`: behavior-breaking failures, including unavailable hard dependencies for affected features
- `warn`: rare or important lifecycle events, recovery, and suspicious non-fatal events
- `info`: medium-signal operational summaries
- `debug`: high-volume troubleshooting, common success paths, and flow logs

## Event Inventory

### Fatal

- `missing_mongodb_uri`: required DB config missing at startup
- `unhandled_promise_rejection`: unhandled process-level rejected promise
- `uncaught_exception`: unhandled process-level exception
- `server_startup_failed`: backend failed to start

### Error

- `http_request_unhandled_error`: uncaught Express request error
- `db_connect_failed`: initial Mongo connection failed
- `db_ping_failed`: Mongo ping failed after startup
- `db_ping_recovered`: Mongo ping recovered after earlier ping failures
- `missing_openai_api_key`: AI features unavailable because the API key is missing
- `server_shutdown_failed`: shutdown sequence failed

- `auth_user_failed`
- `delete_user_failed`
- `increment_win_failed`

- `saved_game_save_failed`
- `saved_game_load_failed`
- `saved_game_delete_failed`

- `dev_auth_session_create_failed`
- `dev_settings_load_failed`
- `dev_settings_update_failed`

- `topic_headers_fetch_failed`
- `popular_topics_fetch_failed`

- `profile_fetch_failed`
- `profile_username_moderation_failed`
- `profile_image_moderation_failed`
- `profile_save_failed`

- `topic_moderation_failed`
- `blocked_topic_attempt_log_failed`
- `subject_generation_missing_api_key`
- `subject_generation_invalid_json`
- `subject_generation_missing_required_fields`
- `subject_generation_too_few_answers`
- `subject_generation_failed`

- `connections_topic_moderation_failed`
- `blocked_connections_topic_attempt_log_failed`
- `connections_generation_missing_api_key`
- `connections_generation_invalid_json`
- `connections_generation_validation_failed`
- `connections_generation_failed`

- `crossword_topic_moderation_failed`
- `blocked_crossword_topic_attempt_log_failed`
- `crossword_generation_missing_api_key`
- `crossword_generation_invalid_json`
- `crossword_candidate_pool_validation_failed`
- `crossword_construction_failed`
- `crossword_generation_attempt_failed`
- `crossword_generation_exhausted`

- `start_game_failed`
- `multiplayer_ai_generation_invalid_payload`
- `multiplayer_room_code_generation_failed`
- `multiplayer_room_creation_failed`
- `multiplayer_room_list_failed`
- `multiplayer_room_mode_lookup_failed`
- `multiplayer_room_start_mark_failed`
- `multiplayer_room_delete_failed`

### Warn

- `http_request_aborted`: client disconnected before the response completed
- `server_started`: backend booted successfully
- `db_connected`: Mongo became available
- `db_connection_closed`: Mongo connection closed during shutdown
- `server_shutdown_requested`: process received a shutdown signal

- `socket_join_invalid_room`
- `socket_join_started_room_rejected`
- `socket_join_duplicate_device`
- `socket_join_room_full`
- `socket_join_invalid_username`
- `socket_engine_connection_error`

### Info

- `ai_topic_blocked`
- `connections_topic_blocked`
- `crossword_topic_blocked`
- `profile_username_blocked`
- `profile_image_blocked`

### Debug

- `http_request_finished`

- `subject_generation_succeeded`
- `connections_generation_succeeded`
- `crossword_generation_succeeded`

- `socket_connected`
- `socket_joined_room`
- `socket_room_host_assigned`
- `socket_room_players_updated`
- `socket_game_started`
- `socket_powerup_used`
- `socket_chat_message`
- `socket_room_deleted`
- `socket_disconnected`

- `multiplayer_ai_generation_requested`
- `multiplayer_existing_topic_selected`
- `multiplayer_room_created`
- `multiplayer_room_deleted`
- `multiplayer_rooms_listed`
- `multiplayer_room_started`

## Notes

- AI success logs include token usage and summary counts.
- Moderation block logs include flagged categories and moderation model when available.
- Request-scoped HTTP error and abort logs include `requestId`, method, path, IP, and duration.
- Serialized errors include `name`, `message`, `stack`, and any enumerable custom fields.
