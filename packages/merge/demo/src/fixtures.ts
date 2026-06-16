export type DemoFixture = {
	id: string;
	label: string;
	path: string;
	language: string;
	leftLabel: string;
	baseLabel: string;
	rightLabel: string;
	left: string;
	base: string;
	right: string;
};

export const fixtures: DemoFixture[] = [
	{
		id: "quicksort-c",
		label: "Quicksort C",
		path: "quicksort.c",
		language: "c",
		leftLabel: "Left",
		baseLabel: "Base",
		rightLabel: "Right",
		left: `void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int partition(int array[], int low, int high) {
  int pivot = array[high];
  int i = low - 1;

  for (int j = low; j < high; j++) {
    if (array[j] <= pivot) {
      i++;
      swap(&array[i], &array[j]);
    }
  }
  swap(&array[high], &array[i + 1]);

  return i + 1;
}

/**
 * Simple implementation of the Quick Sort
 */
void quick_sort(int array[], int low, int high) {
  if (low < high) {
    int pi = partition(array, low, high);

    quick_sort(array, low, pi - 1);
    quick_sort(array, pi + 1, high);
  }
}
`,
		base: `void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int partition(int array[], int low, int high) {
  int pivot = array[high];
  int i = low - 1;

  // Move all the elements higher than the pivot
  // to the left side of the partition
  for (int j = low; j < high; j++) {
    if (array[j] <= pivot) {
      i++;
      swap(&array[i], &array[j]);
    }
  }
  swap(&array[i + 1], &array[high]);

  return i + 1;
}

void quick_sort(int array[], int low, int high) {
  if (low < high) {
    int pi = partition(array, low, high);

    quick_sort(array, low, pi - 1);
    quick_sort(array, pi + 1, high);
  }
}
`,
		right: `void swap(int *a, int *b) {
  int t = *a;
  *a = *b;
  *b = t;
}

int partition(int *array, int low, int high) {
  int pivot = array[high];
  int i = low - 1;

  for (int j = low; j < high; j++) {
    if (array[j] <= pivot) {
      i++;
      swap(&array[i], &array[j]);
    }
  }
  swap(
    &array[i + 1],
    &array[high]
  );

  return i + 1;
}

void quick_sort(int array[], int low, int high) {
  if (low < high) {
    int pi = partition(array, low, high);

    quick_sort(array, low, pi - 1);
    quick_sort(array, pi + 1, high);
  }
}
`,
	},
	{
		id: "merge-preview-c",
		label: "Merge preview C",
		path: "merge-preview.c",
		language: "c",
		leftLabel: "Left",
		baseLabel: "Base",
		rightLabel: "Right",
		base: `#include <stdio.h>
#include <string.h>

typedef struct {
  const char *base_url;
  const char *project;
  const char *branch;
  const char *query;
  int page;
  int page_size;
  int timeout_ms;
  int include_archived;
} MergePreviewRequest;

static int clamp_page_size(int page_size) {
  if (page_size < 1) {
    return 1;
  }
  if (page_size > 100) {
    return 100;
  }
  return page_size;
}

static void append_bool_param(char *buffer, size_t size, const char *name, int enabled) {
  snprintf(buffer + strlen(buffer), size - strlen(buffer), "&%s=%s", name, enabled ? "true" : "false");
}

static void append_debug_header(char *response, size_t size, const MergePreviewRequest *request) {
  snprintf(
    response + strlen(response),
    size - strlen(response),
    "X-Debug-Trace: project=%s branch=%s query=%s page=%d page_size=%d timeout_ms=%d\\n",
    request->project,
    request->branch,
    request->query,
    request->page,
    request->page_size,
    request->timeout_ms
  );
}

int build_merge_preview_url(const MergePreviewRequest *request, char *buffer, size_t size) {
  if (!request || !buffer || size == 0) {
    return -1;
  }

  snprintf(
    buffer,
    size,
    "%s/api/v1/projects/%s/compare?branch=%s&query=%s&page=%d&page_size=%d&timeout_ms=%d",
    request->base_url,
    request->project,
    request->branch,
    request->query,
    request->page,
    clamp_page_size(request->page_size),
    request->timeout_ms
  );
  append_bool_param(buffer, size, "include_archived", request->include_archived);

  return 0;
}

int send_merge_preview_request(const MergePreviewRequest *request, char *response, size_t response_size) {
  char url[1024];
  int status = build_merge_preview_url(request, url, sizeof(url));

  if (status != 0) {
    return status;
  }

  snprintf(response, response_size, "GET %s HTTP/1.1\\nHost: merge-preview.internal\\n", url);
  append_debug_header(response, response_size, request);
  snprintf(response + strlen(response), response_size - strlen(response), "\\n");
  return 200;
}
`,
		left: `#include <stdio.h>
#include <string.h>

typedef struct {
  const char *base_url;
  const char *project;
  const char *branch;
  const char *query;
  int page;
  int page_size;
  int timeout_ms;
  int include_archived;
  const char *viewer;
} MergePreviewRequest;

static int clamp_page_size(int page_size) {
  if (page_size <= 0) {
    return 25;
  }
  if (page_size > 250) {
    return 250;
  }
  return page_size;
}

static void append_bool_param(char *buffer, size_t size, const char *name, int enabled) {
  snprintf(buffer + strlen(buffer), size - strlen(buffer), "&%s=%s", name, enabled ? "true" : "false");
}

static void append_string_param(char *buffer, size_t size, const char *name, const char *value) {
  if (!value || value[0] == '\\0') {
    return;
  }

  snprintf(buffer + strlen(buffer), size - strlen(buffer), "&%s=%s", name, value);
}

static void append_debug_header(char *response, size_t size, const MergePreviewRequest *request) {
  snprintf(
    response + strlen(response),
    size - strlen(response),
    "X-Debug-Trace: viewer=%s project=%s branch=%s query=%s page=%d page_size=%d timeout_ms=%d\\n",
    request->viewer,
    request->project,
    request->branch,
    request->query,
    request->page,
    request->page_size,
    request->timeout_ms
  );
}

int build_merge_preview_url(const MergePreviewRequest *request, char *buffer, size_t size) {
  if (!request || !buffer || size == 0) {
    return -1;
  }

  snprintf(
    buffer,
    size,
    "%s/api/v2/projects/%s/compare?branch=%s&query=%s&page=%d&page_size=%d&timeout_ms=%d",
    request->base_url,
    request->project,
    request->branch,
    request->query,
    request->page,
    clamp_page_size(request->page_size),
    request->timeout_ms
  );
  append_bool_param(buffer, size, "include_archived", request->include_archived);
  append_bool_param(buffer, size, "expand_conflicts", 1);
  append_string_param(buffer, size, "viewer", request->viewer);

  return 0;
}

int send_merge_preview_request(const MergePreviewRequest *request, char *response, size_t response_size) {
  char url[1024];
  int status = build_merge_preview_url(request, url, sizeof(url));

  if (status != 0) {
    return status;
  }

  snprintf(response, response_size, "GET %s HTTP/1.1\\nHost: merge-preview.internal\\n", url);
  append_debug_header(response, response_size, request);
  snprintf(response + strlen(response), response_size - strlen(response), "X-Merge-Mode: interactive\\n");
  snprintf(response + strlen(response), response_size - strlen(response), "X-Preview-Source: dashboard\\n\\n");
  return 202;
}
`,
		right: `#include <stdio.h>
#include <string.h>

typedef struct {
  const char *base_url;
  const char *project;
  const char *target_branch;
  const char *query;
  int page;
  int page_size;
  int timeout_ms;
  int include_archived;
  int compact_output;
} MergePreviewRequest;

static int clamp_page_size(int page_size) {
  if (page_size < 1) {
    return 1;
  }
  if (page_size > 50) {
    return 50;
  }
  return page_size;
}

static void append_bool_param(char *buffer, size_t size, const char *name, int enabled) {
  snprintf(buffer + strlen(buffer), size - strlen(buffer), "&%s=%d", name, enabled ? 1 : 0);
}

static void append_debug_header(char *response, size_t size, const MergePreviewRequest *request) {
  snprintf(
    response + strlen(response),
    size - strlen(response),
    "X-Debug-Trace: project=%s target_branch=%s query=%s page=%d per_page=%d timeout=%d compact=%d\\n",
    request->project,
    request->target_branch,
    request->query,
    request->page,
    request->page_size,
    request->timeout_ms,
    request->compact_output
  );
}

int build_merge_preview_url(const MergePreviewRequest *request, char *buffer, size_t size) {
  if (!request || !buffer || size == 0) {
    return -1;
  }

  snprintf(
    buffer,
    size,
    "%s/api/v1/merge-preview/%s?target_branch=%s&search=%s&page=%d&per_page=%d&timeout=%d",
    request->base_url,
    request->project,
    request->target_branch,
    request->query,
    request->page,
    clamp_page_size(request->page_size),
    request->timeout_ms
  );
  append_bool_param(buffer, size, "include_archived", request->include_archived);
  append_bool_param(buffer, size, "compact", request->compact_output);

  return 0;
}

int send_merge_preview_request(const MergePreviewRequest *request, char *response, size_t response_size) {
  char url[1024];
  int status = build_merge_preview_url(request, url, sizeof(url));

  if (status != 0) {
    return status;
  }

  snprintf(response, response_size, "GET %s HTTP/1.1\\nHost: merge-preview.internal\\n", url);
  append_debug_header(response, response_size, request);
  snprintf(response + strlen(response), response_size - strlen(response), "X-Merge-Mode: compact\\n\\n");
  return 206;
}
`,
	},
	{
		id: "vcs-rust",
		label: "VCS Rust conflict",
		path: "src/conflict.rs",
		language: "rust",
		leftLabel: "Ours",
		baseLabel: "Base",
		rightLabel: "Theirs",
		left: `pub fn conflict_label() -> &'static str {
    "left"
}
`,
		base: `pub fn conflict_label() -> &'static str {
    "base"
}
`,
		right: `pub fn conflict_label() -> &'static str {
    "right"
}
`,
	},
];
