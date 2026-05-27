# Conductor Blender Submitter — Complete Reference Guide

> **Purpose:** Full documentation of every panel, field, and button in the Conductor Blender Submitter add-on, for addon development vetting and cross-reference.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Conductor Job Panel](#2-conductor-job-panel)
3. [General Configuration Panel](#3-general-configuration-panel)
4. [Render Settings Panel](#4-render-settings-panel)
5. [Frames Panel](#5-frames-panel)
6. [Frames Info Panel (Read-Only)](#6-frames-info-panel-read-only)
7. [Add-ons Panel](#7-add-ons-panel)
8. [Advanced Panel](#8-advanced-panel)
9. [Additional Rendering Options](#9-additional-rendering-options)
10. [Recommended Submission Workflow](#10-recommended-submission-workflow)
11. [Frame Spec Syntax Quick Reference](#11-frame-spec-syntax-quick-reference)

---

## 1. Overview

Conductor for Blender is an official add-on that allows artists to submit rendering jobs to the Conductor cloud render farm directly from within the Blender UI. The submitter is organised into five main collapsible panels, each controlling a distinct aspect of job submission:

| Panel | Purpose |
|---|---|
| **Conductor Job** | Connection, preview, and submission controls |
| **General Configuration** | Hardware, software, and project settings |
| **Render Settings** | Resolution, camera, and sample overrides |
| **Frames** | Chunk size, frame range, and scout frame controls |
| **Advanced** | Output folder, extra assets, and environment variables |

---

## 2. Conductor Job Panel

This is the top-level panel and must be interacted with first. It contains three action buttons that drive the entire workflow.

### Connect

Initiates a connection to the Conductor servers and retrieves account-specific data: available projects, software packages, and instance types.

- **Must be pressed first** before any dropdowns (Project, Instance Type, etc.) will populate
- If projects are added or removed on the server after connecting, press again to refresh

### Preview Script

Generates and displays a JSON payload representing the full job submission.

- Updates dynamically as you change any settings in the submitter
- Use this to verify all settings are correctly captured before submitting
- The `upload_paths` list inside this JSON shows every file that will be uploaded to the farm
- Also useful for offline or scripted submission workflows

### Submit

Sends the fully configured job to Conductor.

- All settings and scene assets are packaged and queued in the Conductor rendering environment
- The job appears on the Conductor dashboard for monitoring immediately after

---

## 3. General Configuration Panel

Controls core job identity, hardware selection, and software version settings.

### Job Title

- Human-readable name displayed on the Conductor dashboard
- Default is auto-generated from the Blender filename, renderer, and other metadata
- Can be freely edited — useful for identifying jobs when multiple are queued

### Project

- Dropdown to select which Conductor project this job belongs to
- Populated only after pressing **Connect**
- If the list shows only `— Not Connected —`, press Connect first
- Press Connect again to refresh if projects were added/removed on the server

### Instance Type

- Selects between **GPU-equipped** or **CPU-only** cloud machines
- **GPU strongly recommended** for Cycles (speed)
- **GPU is mandatory** for Eevee and Redshift — these renderers exclusively support GPU operations and will not work on CPU-only instances

### Machine Type

- Selects the specific hardware configuration within the chosen Instance Type
- **For GPU machines:** evaluate number of cores, RAM, GPU model, and GPU VRAM
- **For CPU machines:** evaluate core count and total RAM
- Choose based on scene complexity and memory requirements

### Preemptible *(checkbox)*

- Preemptible instances use spare cloud capacity and are significantly cheaper than standard instances
- **Trade-off:** the cloud provider can interrupt (preempt) the task at any time with no warning
- **No checkpointing** — if preempted, the task restarts from frame zero on a new instance
- Risk of preemption increases with longer task duration
- The preemptible setting can also be changed per-account on the Conductor dashboard

### Preemptible Retries

- Integer field — only relevant and visible when **Preemptible** is enabled
- Sets how many times a preempted task should automatically retry on a new instance before being marked as failed
- Set to `0` to disable automatic retries
- The screenshot shows this set to `1`

### Blender Version

- Dropdown to select which version of Blender runs on the remote render nodes
- Can differ from your local Blender version (useful for cross-version testing or farm requirements)
- **Important:** changing this version updates the available Render Software options and the Add-ons list, as package availability is version-dependent

### Render Software

- Dropdown to choose the rendering engine: Cycles, Eevee, Redshift, etc.
- For Cycles: GPU strongly recommended
- For Eevee and Redshift: GPU is mandatory
- Selection affects which Render Version options appear

### Render Version

- Dropdown to select the specific version of the chosen render software
- For **Cycles** and **Eevee**: version selection is not applicable — they are bundled with Blender and have no separate version number
- Primarily relevant for third-party renderers like **Redshift**

---

## 4. Render Settings Panel

These fields allow you to **override render settings for the farm job independently** of what is set in your local Blender scene. Changes here do **not** modify your Blender scene file — they are submission-only overrides sent to the remote nodes.

### Resolution X

- Override the horizontal pixel count for the rendered output
- Does not affect Resolution X in your local Blender scene

### Resolution Y

- Override the vertical pixel count for the rendered output
- Does not affect Resolution Y in your local Blender scene

### Resolution Percentage

- Override the resolution scale percentage (e.g., `50%` renders at half the specified X/Y resolution)
- Does not affect the local scene percentage
- Check **Preview Script** to confirm the final effective render resolution

### Camera

- Override which camera is used to render the job
- Can differ from the active camera in your Blender scene
- Changing this here does **not** alter the active camera in the scene file
- Useful for multi-camera shot submissions without modifying the scene

### Samples

- Override the number of render samples per pixel for the submitted job
- Higher samples improve quality but increase render time
- Does not change the sample count in your local scene
- For high sample counts with Cycles, GPU instances are strongly recommended

---

## 5. Frames Panel

The Frames panel controls how the frame range is divided into tasks and distributed across cloud machines. This is one of the most critical panels for cost and efficiency optimisation.

### Chunk Size

An integer field that sets how many frames each cloud task (machine) renders.

> **One chunk = one task = one cloud machine**

| Chunk Size | When to use |
|---|---|
| `1` | Maximum parallelism. Every frame gets its own machine. Best when machines are plentiful and render time per frame is long. |
| `1–5` | Recommended for complex/heavy scenes |
| `10–20` | Recommended for simpler/faster scenes where instance spin-up overhead is significant relative to render time |

> **Important:** Each cloud machine executes its entire chunk — there is no partial execution of a chunk. This has implications for scout frames (see below).

---

### Use Custom Range *(checkbox)*

- When **enabled**, unlocks the Custom Range field and overrides the frame range defined in the Blender scene settings
- When **disabled**, the scene's own frame range is used automatically

---

### Custom Range

A text field for specifying which frames to render. Only active when **Use Custom Range** is checked.

Accepts a flexible frame spec syntax:

| Syntax | Meaning |
|---|---|
| `42` | Single frame |
| `1-100` | All frames 1 to 100 inclusive |
| `1-100x2` | Every 2nd frame: 1, 3, 5 … 99 |
| `1,7,10-20,30-60x3,1001` | Mixed comma-separated list with steps |
| `-50--10x2,-3-6` | Negative and mixed ranges |

- Spaces and trailing commas are permitted and ignored
- Letters and non-numeric symbols are **not** permitted
- The field can be edited manually or auto-filled using an expression
- The screenshot shows this set to `1-5`

---

### Use Scout Frames *(checkbox)*

Activates the Scout Frames feature.

- When enabled, a **subset of frames renders first** and all remaining tasks are placed in a **hold state**
- This allows the artist to review a sample of rendered output for errors, lighting issues, or missing assets before committing the full job
- After approving the scout frames, held tasks are released manually on the Conductor dashboard

---

### Scout Frames

A text field specifying which frames to scout. Accepts the same frame spec syntax as Custom Range, **plus** special shorthand expressions:

| Expression | Meaning |
|---|---|
| `fml:3` | **First, Middle, Last** — 3 frames at the start, middle, and end of the range. E.g., for range 1–100: frames `1, 51, 100` |
| `auto:3` | **Evenly spaced** — 3 frames distributed evenly across the range. E.g., for range 1–100: frames `17, 51, 84` |
| `fml:N` | Generalised: N frames at first/middle/last positions |
| `auto:N` | Generalised: N evenly spaced frames |
| `1-100x30` | Manual frame spec: every 30th frame from 1 to 100 |
| `3,8` | Manual list: render frames 3 and 8 as scouts |

> ⚠️ **Critical interaction with Chunk Size:**
> Remote render nodes execute entire tasks (chunks) — they cannot render a partial chunk. If chunk size > 1 and a scout frame falls within a chunk alongside non-scout frames, **all frames in that chunk are rendered**. This can result in more frames being rendered than explicitly listed as scouts. Design your scout frame spec with this in mind when using chunk sizes larger than 1.

---

## 6. Frames Info Panel (Read-Only)

A read-only information panel that resolves and displays the computed result of all Frames settings. All fields update dynamically as you change Chunk Size, Custom Range, or Scout Frames settings. Use this to verify your configuration before submitting.

| Field | Description |
|---|---|
| **Frame Spec** | The fully resolved frame range that will be submitted — the actual list of frames after parsing the Custom Range expression |
| **Scout Spec** | The resolved list of scout frames after parsing the Scout Frames expression (e.g., `fml:3` resolves to `1, 51, 100` for a 1–100 range) |
| **Frame Count** | Total number of individual frames to be rendered across the entire job |
| **Task Count** | Total number of cloud tasks (machines) that will be created. Example: 100 frames with chunk size 2 = 50 tasks. Directly reflects cost and parallelism level. |
| **Scout Frame Count** | Number of frames rendered in the scout phase. If chunk size > 1, this may be higher than the number of explicitly specified scout frames because entire chunks are executed. |
| **Scout Task Count** | Number of tasks that contain at least one scout frame and will therefore start immediately. All other tasks are placed on hold. |

---

## 7. Add-ons Panel

A list of available Blender add-ons that can be enabled on the remote render nodes alongside your job. This ensures any Blender add-ons required by your scene are present on the farm machines.

- The available add-ons list is **tied to the selected Blender Version** — changing Blender Version updates this list
- Each add-on may have its own **version dropdown** to select a specific compatible version
- Only add-ons officially supported and packaged by Conductor appear here
- Add-ons not in this list must be handled via the **Extra Assets** section in Advanced settings

---

## 8. Advanced Panel

Contains power-user controls for output destinations, manual asset inclusion, and environment variable configuration.

### Output Folder

- Specifies the destination directory where rendered images will be written on the cloud render nodes
- Conductor's render nodes treat this path as write-only

> ⚠️ **Critical:** This folder and its subfolders must **not** contain any assets used as inputs for the scene. Mixing input assets into the output directory can cause conflicts or failed uploads.

---

### Add Extra Asset

A file/folder browser to manually include additional files that were not automatically detected by Conductor's asset scanner.

**Use cases:**
- Custom Python scripts or shell scripts used during rendering
- Textures or HDRIs referenced via absolute paths outside the project directory
- Font files, LUTs, or other external dependencies
- Any file that does not appear in the `upload_paths` list in the Preview Script

> Do **not** use this for assets already linked within the Blender scene (e.g., linked libraries, packed textures). Those are handled automatically by the Linked Assets system.

---

### Add Extra Environment Variables

Define custom key-value environment variables that will be set on the remote render node before the render command executes.

| Setting | Description |
|---|---|
| **Key** | The environment variable name (e.g., `PYTHONPATH`, `MY_RENDER_FLAG`) |
| **Value** | The value to assign. Can reference existing environment variables. |
| **Exclusive mode** | Replaces any existing value for this variable on the render node |
| **Appendable mode** | Appends the new value to the existing variable (e.g., adding entries to `PATH`) |

> **Windows submission note:** When configuring paths for Windows submissions, exclude the drive letter from the script path in the environment variable value — use `/MyScripts/run.py` instead of `C:/MyScripts/run.py`. Custom scripts referenced in env vars must also be added via Extra Assets.

---

## 9. Additional Rendering Options

A set of advanced toggles for fine-grained control over Blender's runtime behaviour on the render nodes.

### Disable Audio

- Forces Blender's sound system to `None` on the render node, disabling all audio processing
- Recommended for pure rendering jobs where audio is not needed
- Avoids potential audio driver issues on headless cloud servers

---

## 10. Recommended Submission Workflow

Follow these steps in order for a clean, verified submission:

| Step | Action |
|---|---|
| **1. Open Submitter Panel** | Access the Conductor submitter in the Blender N-panel or Properties panel |
| **2. Press Connect** | Authenticate and fetch your account data. Wait for dropdowns to populate. |
| **3. Set General Config** | Select Project, Instance Type, Machine Type, Blender Version, and Render Software |
| **4. Configure Render Settings** | Override Resolution, Camera, or Samples only if needed for this job |
| **5. Set Frame Range** | Enable Use Custom Range if needed. Set Chunk Size appropriate to scene complexity. |
| **6. Configure Scout Frames** | Enable Use Scout Frames. Set `fml:3` or `auto:3` for a quick preview sample. |
| **7. Check Frames Info** | Verify Frame Count, Task Count, Scout Frame Count, and Scout Task Count |
| **8. Select Add-ons** | Enable any Blender add-ons your scene depends on |
| **9. Advanced Settings** | Add any extra assets or environment variables needed by the scene |
| **10. Preview Script** | Click Preview Script and inspect the JSON payload. Verify all `upload_paths` are correct. |
| **11. Submit** | Press Submit. Monitor the job on the Conductor dashboard. Review scout frames before releasing held tasks. |

---

## 11. Frame Spec Syntax Quick Reference

| Expression | Result |
|---|---|
| `1-100` | All frames from 1 to 100 inclusive |
| `1-100x2` | Every 2nd frame: 1, 3, 5 … 99 |
| `1-100x10` | Every 10th frame: 1, 11, 21 … 91 |
| `1,50,100` | Frames 1, 50, and 100 only |
| `1-10,90-100` | Frames 1–10 and 90–100 |
| `1,7,10-20,30-60x3,1001` | Mixed list with step |
| `-50--10x2` | Negative range: every 2nd frame from -50 to -10 |
| `fml:3` | Scout: First, Middle, Last (3 frames) |
| `fml:5` | Scout: First, Middle, Last spread across 5 positions |
| `auto:3` | Scout: 3 evenly distributed frames |
| `auto:N` | Scout: N evenly distributed frames |

---

*Source: [Conductor Blender Submitter Documentation](https://docs.conductortech.com/reference/blender/)*
