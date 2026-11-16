import type { Program } from "ollieos/types";

import game_source_raw from "./ClassiCube.js?raw";
import {install_web_storage} from "ollieos/lib/web_storage";

export default {
    name: "classicube",
    description: "ClassiCube ported to OllieOS!",
    usage_suffix: "",
    arg_descriptions: {},
    compat: "3.0.0",
    needs_dom: true,
    gui: {
        display_name: "ClassiCube",
    },
    main: async (data) => {
        const { term, kernel, process } = data;

        if (!kernel.has_window_manager()) {
            term.writeln("This program requires a window manager to run.");
            return 1;
        }


        const wind = await process.create_window();

        wind.title = "ClassiCube";

        const canvas = document.createElement("canvas");
        canvas.style.border = "none";
        canvas.style.padding = "0";
        canvas.style.display = "block";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.backgroundColor = "black";

        const span = document.createElement("span");
        span.style.position = "absolute";
        span.style.top = "50%";
        span.style.left = "50%";
        span.style.transform = "translate(-50%, -50%)";
        span.style.color = "white";
        span.style.fontFamily = "monospace";
        span.style.fontSize = "1.5em";

        const content = document.createElement("div");
        content.style.position = "relative";
        content.style.width = "100%";
        content.style.height = "100%";
        content.appendChild(canvas);
        content.appendChild(span);

        wind.dom.appendChild(content);

        // the game draws at the canvas's own size, so keep it matching the size on screen or it renders small and gets stretched
        const fit_canvas = () => {
            canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
            canvas.height = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
        };
        new ResizeObserver(fit_canvas).observe(canvas);

        const fs = kernel.get_fs();

        await install_web_storage(fs, "~/.local/share/classicube");

        // the texture pack is fetched from /static/default.zip, which doesn't exist in the frame, so it is served from a blob instead
        const texture_pack = await fs.read_file("/usr/lib/classicube/default.zip", true) as Uint8Array;
        const texture_pack_url = URL.createObjectURL(new Blob([texture_pack.slice()], {type: "application/zip"}));

        const game_source = game_source_raw.replace("var url  = '/static/default.zip'", `var url = '${texture_pack_url}';`);

        const Module = {
            preRun: [],
            postRun: [],
            arguments: ["ollieos"], //[ {username}, {mppass}, {server ip}, {server port} ], // TODO: configurable name, and allow multiplayer args
            print: function(text) {
                if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(" ");
                console.log(text);
            },
            printErr: function(text) {
                if (arguments.length > 1) text = Array.prototype.slice.call(arguments).join(" ");
                console.error(text);
            },
            canvas,
            setStatus: function(text) {
                console.log(text);
                span.innerText = text;
            },
            totalDependencies: 0,
            monitorRunDependencies: function(left) {
                this.totalDependencies = Math.max(this.totalDependencies, left);
                Module.setStatus(left ? "Preparing... (" + (this.totalDependencies-left) + "/" + this.totalDependencies + ")" : "All downloads complete.");
            }
        };
        Module.setStatus("Downloading...");
        window.onerror = function(msg) {
            // TODO: do not warn on ok events like simulating an infinite loop or exitStatus
            Module.setStatus("Exception thrown, see JavaScript console (" + msg + ")");
            Module.setStatus = function(text) {
                if (text) Module.printErr("[post-exception status] " + text);
            };
        };
        globalThis.Module = Module;

        // determine if width or height is the limiting factor
        const screen_size = kernel.get_window_manager()!.get_screen_size();
        const width_limited = (screen_size.width / screen_size.height) < (4 / 3);

        // generate width and height based on limiting factor. get to 95% of the limiting factor but maintain 4:3 aspect ratio
        // do it in terms of viewport units, ensuring to use the same unit for both width and height
        const unit = width_limited ? "vw" : "vh";
        const win_size = 95;

        const width = width_limited ? win_size : (win_size * (4 / 3));
        const height = width_limited ? (win_size * (3 / 4)) : win_size

        wind.width = `${width}${unit}`;
        wind.height = `${height}${unit}`;

        // use window.inner sizes to center the window
        wind.x = (screen_size.width - (width_limited ? (win_size / 100 * screen_size.width) : (win_size * (4 / 3) / 100 * screen_size.height))) / 2;
        wind.y = (screen_size.height - (width_limited ? (win_size * (3 / 4) / 100 * screen_size.width) : (win_size / 100 * screen_size.height))) / 2;

        wind.show();

        const game_script = document.createElement("script");
        game_script.src = URL.createObjectURL(new Blob([game_source], {type: "text/javascript"}));
        document.head.appendChild(game_script);

        // focus canvas on window focus
        wind.add_event_listener("focus", () => {
            canvas.focus();
        });

        wind.add_event_listener("close", () => {
            URL.revokeObjectURL(texture_pack_url);
            URL.revokeObjectURL(game_script.src);
            process.kill(0);
        });

        process.detach();
        return 0;
    }
} satisfies Program;
