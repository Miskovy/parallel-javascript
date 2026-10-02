/* Research diagnostic only: load the exact library already mapped by Node. */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <zlib.h>

int main(int argc, char **argv) {
    if (argc < 3) return 2;
    void *library = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!library) { fprintf(stderr, "%s\n", dlerror()); return 3; }
    const char *(*version)(void) = dlsym(library, "zlibVersion");
    int (*init)(z_streamp, int, int, int, int, int, const char *, int) =
        dlsym(library, "deflateInit2_");
    unsigned long (*bound)(z_streamp, unsigned long) = dlsym(library, "deflateBound");
    int (*end)(z_streamp) = dlsym(library, "deflateEnd");
    Dl_info location;
    if (!version || !init || !bound || !end || !dladdr((void *)bound, &location)) return 4;
    printf("{\"headerVersion\":\"%s\",\"libraryVersion\":\"%s\","
           "\"libraryPath\":\"%s\",\"streamSize\":%zu,\"rows\":[",
           ZLIB_VERSION, version(), location.dli_fname, sizeof(z_stream));
    int first = 1;
    const int levels[] = {1, 6, 9};
    const int windows[] = {-15, 15, 31};
    for (int arg = 2; arg < argc; arg++) {
        char *tail;
        unsigned long n = strtoul(argv[arg], &tail, 10);
        if (*tail || n > 8388608UL) return 5;
        for (int w = 0; w < 3; w++) for (int l = 0; l < 3; l++) {
            z_stream stream;
            memset(&stream, 0, sizeof(stream));
            if (init(&stream, levels[l], Z_DEFLATED, windows[w], 8,
                     Z_DEFAULT_STRATEGY, version(), sizeof(stream)) != Z_OK) return 6;
            unsigned long maximum = bound(&stream, n);
            if (end(&stream) != Z_OK) return 7;
            printf("%s{\"inputBytes\":%lu,\"level\":%d,\"windowBits\":%d,"
                   "\"nativeBound\":%lu}", first ? "" : ",", n, levels[l], windows[w], maximum);
            first = 0;
        }
    }
    puts("]}");
    dlclose(library);
    return 0;
}
