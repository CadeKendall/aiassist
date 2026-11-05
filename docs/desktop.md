# Desktop behavior

Ctrl+Shift+Space restores, shows and focuses the lesson window and sends a focus event to the prompt. If another application owns the shortcut, the app logs the conflict; the normal window still works. Closing the app releases the shortcut. The shortcut does not capture the screen.

## Screen attachments

The picker lists connected displays with small, local previews. A full attachment requires choosing a listed source. Selections expire after five minutes and are consumed on capture. If a display disappears, capture fails rather than switching to another display. Captures become JPEG images with a longest edge of at most 2560 pixels and an encoded size under 10 MiB.

These utilities return an image to the app without transmitting it. Sending an attachment with a question is handled by the conversation layer. Desktop capture may include this app and other visible applications. Protected windows may appear blank, and OS permissions can prevent capture. This module has no continuous recording or background screenshot timer. Electron enumerates display thumbnails for the picker; only the selected image is returned as the attachment.

## Saved lessons

The main process chooses the storage directory. Each JSON lesson contains a scene, messages, timestamp and optional Codex thread ID. IDs use letters, digits, underscores and hyphens; Windows device names are rejected. Save and import use the shared lesson and scene validation.

Writes to a lesson are ordered. Saving writes and flushes a unique temporary file, then renames it over the previous file. Invalid replacements preserve the existing lesson. Interrupted writes may leave a temporary file that the list ignores. Malformed lessons are omitted from the list but remain on disk for recovery; opening one directly reports an error. Storage has no encryption layer or cloud synchronization.

Native dialogs select import and export files. Imports accept UTF-8 JSON, including a byte-order mark, and validate the entire lesson before returning it. Cancellation changes nothing. Exports include conversation text and a thread reference. Adding an imported lesson to the library is a separate app action.

Files are capped at 8 MiB; the shared schema also caps message and scene complexity. Persistence stores the current scene and conversation, not a time-stamped history of scene states, microphone audio or screen attachments. A saved thread ID resumes only if that thread remains available to the local Codex installation and account. Importing a reference on another machine does not transfer its Codex conversation history.

## Verification boundary

Storage tests cover reload, unsafe paths, corrupt files, mismatched IDs, invalid replacement, concurrent writes/deletion and payload limits. The display picker, native dialogs and hotkey require desktop verification; unit tests alone do not establish support for every Windows setup. Atomic replacement prevents partial JSON files during ordinary operation but is not a backup or a guarantee against disk failure. Export writes directly to the destination chosen in the native save dialog.
