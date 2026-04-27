// node-launcher — tiny wrapper that hides the sidecar from macOS Dock.
//
// Tauri sidecars live at <bundle>/Contents/MacOS/node and get a Dock icon
// because LaunchServices treats binaries inside Contents/MacOS as
// sub-applications. We replace the bundled `node` with this wrapper, which
// embeds LSUIElement=YES in its __TEXT,__info_plist section (so launchd /
// LaunchServices skip the Dock entry) and posix_spawn()s the real node from
// Contents/Resources/server-resources/node-bin.
//
// We posix_spawn (not execve) on purpose: execve replaces the current image
// and the new image's __info_plist is what gets read, so the LSUIElement flag
// would be lost. By staying alive as the parent we keep the no-Dock policy
// applied to the controlling process, and the child runs from Resources/
// (not Contents/MacOS/) so LaunchServices doesn't auto-promote it either.
//
// Build:
//   clang -O2 -arch arm64 -arch x86_64 launcher.c -o node-launcher \
//     -sectcreate __TEXT __info_plist Info.plist
//
// Then ad-hoc sign with the same identity Tauri uses for the main bundle.

#include <errno.h>
#include <libgen.h>
#include <mach-o/dyld.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;

static volatile pid_t child_pid = 0;

static void forward_signal(int sig) {
  if (child_pid > 0) {
    kill(child_pid, sig);
  }
}

int main(int argc, char *argv[]) {
  char self[4096];
  uint32_t self_size = sizeof(self);
  if (_NSGetExecutablePath(self, &self_size) != 0) {
    fprintf(stderr, "node-launcher: _NSGetExecutablePath buffer too small\n");
    return 1;
  }

  char self_real[4096];
  if (!realpath(self, self_real)) {
    fprintf(stderr, "node-launcher: realpath(self) failed: %s\n", strerror(errno));
    return 1;
  }

  // self_real = .../Contents/MacOS/node
  // node-bin  = .../Contents/Resources/server-resources/node-bin
  char self_dir[4096];
  strncpy(self_dir, self_real, sizeof(self_dir) - 1);
  self_dir[sizeof(self_dir) - 1] = '\0';
  char *dir = dirname(self_dir);

  char target[4096];
  int n = snprintf(target, sizeof(target),
                   "%s/../Resources/server-resources/node-bin", dir);
  if (n < 0 || (size_t)n >= sizeof(target)) {
    fprintf(stderr, "node-launcher: target path too long\n");
    return 1;
  }

  char target_real[4096];
  if (!realpath(target, target_real)) {
    fprintf(stderr, "node-launcher: cannot resolve %s: %s\n", target, strerror(errno));
    return 1;
  }

  // Build child argv: [node-bin, ...inherited args from caller]
  char **child_argv = (char **)calloc((size_t)argc + 1, sizeof(char *));
  if (!child_argv) {
    fprintf(stderr, "node-launcher: calloc failed\n");
    return 1;
  }
  child_argv[0] = target_real;
  for (int i = 1; i < argc; i++) {
    child_argv[i] = argv[i];
  }
  child_argv[argc] = NULL;

  pid_t pid = 0;
  int rc = posix_spawn(&pid, target_real, NULL, NULL, child_argv, environ);
  free(child_argv);
  if (rc != 0) {
    fprintf(stderr, "node-launcher: posix_spawn(%s) failed: %s\n",
            target_real, strerror(rc));
    return 1;
  }
  child_pid = pid;

  struct sigaction sa;
  memset(&sa, 0, sizeof(sa));
  sa.sa_handler = forward_signal;
  sigemptyset(&sa.sa_mask);
  sa.sa_flags = SA_RESTART;
  sigaction(SIGTERM, &sa, NULL);
  sigaction(SIGINT, &sa, NULL);
  sigaction(SIGHUP, &sa, NULL);
  sigaction(SIGQUIT, &sa, NULL);

  int status = 0;
  while (waitpid(pid, &status, 0) == -1) {
    if (errno != EINTR) {
      perror("node-launcher: waitpid");
      return 1;
    }
  }

  if (WIFEXITED(status)) return WEXITSTATUS(status);
  if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
  return 1;
}
