import { app } from "../../scripts/app.js";

// --- Dehypnotic Save Video: Properties Panel Extension ----------------------
// Moves number_padding and number_start from the node body into
// the Properties panel (right-click -> Properties), exactly like SaveImages.

const EXTENSION_NAME = "Dehypnotic.SaveVideo.Properties";
const NODE_TYPE = "SaveVideoDehypnotic";

// Widget names to move to Properties
const PROPERTY_WIDGETS = ["number_padding", "number_start"];

app.registerExtension({
  name: EXTENSION_NAME,

  async nodeCreated(node) {
    if (node.comfyClass !== NODE_TYPE) return;

    // -- Move specific widgets to Properties Panel -------------------------
    setTimeout(() => {
      if (node.widgets) {
        for (const w of node.widgets) {
          if (PROPERTY_WIDGETS.includes(w.name)) {
            // Hide the widget from the node body
            w.type = "hidden";
            w.computeSize = () => [0, -4];

            // Register as a property so it shows in the Properties menu
            if (node.properties[w.name] === undefined) {
              node.properties[w.name] = w.value;
            }

            // Tell LiteGraph it is an integer (no decimals)
            node.properties_info = node.properties_info || [];
            if (!node.properties_info.find((p) => p.name === w.name)) {
              node.properties_info.push({
                name: w.name,
                type: "int",
                step: 1,
                precision: 0,
                min: w.options?.min ?? 0,
                max: w.options?.max ?? 1000000,
              });
            }
          }
        }
        node.setSize(node.computeSize());
        app.graph?.setDirtyCanvas(true, true);
      }
    }, 100);

    // Sync property changes back to the hidden widgets so Python gets them
    const origOnPropertyChanged = node.onPropertyChanged;
    node.onPropertyChanged = function (name, value) {
      origOnPropertyChanged?.apply(this, arguments);
      const w = this.widgets?.find((w) => w.name === name);
      if (w) {
        w.value = value;
      }
    };

    // Handle workflow load / undo-redo - restore hidden state after configure
    const origOnConfigure = node.onConfigure;
    node.onConfigure = function (info) {
      origOnConfigure?.apply(this, arguments);
      setTimeout(() => {
        if (!node.widgets) return;
        for (const w of node.widgets) {
          if (PROPERTY_WIDGETS.includes(w.name)) {
            w.type = "hidden";
            w.computeSize = () => [0, -4];
            // Sync stored property value back to widget
            if (node.properties[w.name] !== undefined) {
              w.value = node.properties[w.name];
            }
          }
        }
        node.setSize(node.computeSize());
        app.graph?.setDirtyCanvas(true, true);
      }, 100);
    };
  },
});
