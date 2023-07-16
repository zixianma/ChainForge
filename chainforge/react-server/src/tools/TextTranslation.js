import { useEffect, useState, useRef, useCallback } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { IconTools, IconList, IconLanguage } from '@tabler/icons-react';
import { NativeSelect, Select, Popover, Text, Tooltip, Center, Grid, Space} from '@mantine/core';
import NodeLabel from '../NodeLabelComponent';
import { HfInference } from '@huggingface/inference';
import TemplateHooks, { extractBracketedSubstrings } from '../TemplateHooksComponent'
import { Handle } from 'react-flow-renderer';
import useStore from '../store';
import { AvailableTools, ToolType2Models, ToolType2IOType, InputLanguages, OutputLanguages, ModelHubs } from '../ToolSettingSchemas';
import fetch_from_backend from '../fetch_from_backend';

class PromptInfo {
  prompt; // string

  constructor(prompt) {
    this.prompt = prompt;
  }
}

const displayPromptInfos = (promptInfos) =>
  promptInfos.map((info, idx) => (
    <div key={idx}>
      <pre className='prompt-preview'>{info.prompt}</pre>
    </div>
  ));

const PromptListPopover = ({ promptInfos, onHover, onClick }) => {
  const [opened, { close, open }] = useDisclosure(false);

  const _onHover = useCallback(() => {
    onHover();
    open();
  }, [onHover, open]);

  return (
    <Popover position="right-start" withArrow withinPortal shadow="rgb(38, 57, 77) 0px 10px 30px -14px" key="query-info" opened={opened} styles={{ dropdown: { maxHeight: '500px', maxWidth: '400px', overflowY: 'auto', backgroundColor: '#fff' } }}>
      <Popover.Target>
        <Tooltip label='Click to view all prompts' withArrow>
          <button className='custom-button' onMouseEnter={_onHover} onMouseLeave={close} onClick={onClick} style={{ border: 'none' }}>
            <IconList size='12pt' color='gray' style={{ marginBottom: '-4px' }} />
          </button>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown sx={{ pointerEvents: 'none' }}>
        <Center><Text size='xs' fw={500} color='#666'>Preview of generated prompts ({promptInfos.length} total)</Text></Center>
        {displayPromptInfos(promptInfos)}
      </Popover.Dropdown>
    </Popover>
  );
};

const TextTranslation = ({ data, id }) => {
  const edges = useStore((state) => state.edges);
  const getNode = useStore((state) => state.getNode);
  const output = useStore((state) => state.output);

  const [image, setImage] = useState(data.image || null);
  // const [imageOut, setImageOut] = useState(null);
  const [templateVars, setTemplateVars] = useState(data.vars || []);
  const [promptText, setPromptText] = useState(data.prompt || "");
  const [modelID, setModelID] = useState(data.model || ToolType2Models["Text translation"][0].model);
  const [toolType, setToolType] = useState(data.tooltype || "Text translation");
  const [availableModels, setAvailableModels] = useState(ToolType2Models["Text translation"]);
  const [promptTextOnLastRun, setPromptTextOnLastRun] = useState(null);
  const [status, setStatus] = useState('none');
  const [inputNode, setInputNode] = useState(null);
  const [outputNode, setOutputNode] = useState(null);
  // For displaying error messages to user
  const alertModal = useRef(null);

  // For an info pop-up that shows all the prompts that will be sent off
  // NOTE: This is the 'full' version of the PromptListPopover that activates on hover.
  const [infoModalOpened, { open: openInfoModal, close: closeInfoModal }] = useDisclosure(false);

  const refreshTemplateHooks = (text) => {
    // Update template var fields + handles
    const found_template_vars = extractBracketedSubstrings(text);  // gets all strs within braces {} that aren't escaped; e.g., ignores \{this\} but captures {this}
    setTemplateVars(found_template_vars);
  };

  const setInputOutputNodes = () => {
    edges.forEach(e => {
      if (e.target == id) {
        // console.error("Input node:");
        // console.error(getNode(e.source));
        setInputNode(getNode(e.source));
      } else if (e.source == id) {
        // console.error("Output node:");
        // console.error(getNode(e.target));
        setOutputNode(getNode(e.target));
      }
    }
    );
  };

  // On initialization
  useEffect(() => {
    setInputOutputNodes();
  }, []);

  // Pull all inputs needed to request responses.
  // Returns [prompt, vars dict]
  const pullInputData = () => {
    // Pull data from each source recursively:
    const pulled_data = {};
    const store_data = (_texts, _varname, _data) => {
      if (_varname in _data)
        _data[_varname] = _data[_varname].concat(_texts);
      else
        _data[_varname] = _texts;
    };
    const get_outputs = (varnames, nodeId) => {
      varnames.forEach(varname => {
        // Find the relevant edge(s):
        edges.forEach(e => {
          if (e.target == nodeId && e.targetHandle == varname) {
            // Get the immediate output:
            let out = output(e.source, e.sourceHandle);
            if (!out || !Array.isArray(out) || out.length === 0) return;

            // Check the format of the output. Can be str or dict with 'text' and more attrs:
            if (typeof out[0] === 'object') {
              out.forEach(obj => store_data([obj], varname, pulled_data));
            }
            else {
              // Save the list of strings from the pulled output under the var 'varname'
              store_data(out, varname, pulled_data);
            }

            // Get any vars that the output depends on, and recursively collect those outputs as well:
            const n_vars = getNode(e.source).data.vars;
            if (n_vars && Array.isArray(n_vars) && n_vars.length > 0)
              get_outputs(n_vars, e.source);
          }
        });
      });
    };
    get_outputs(templateVars, id);

    return [promptText, pulled_data];
  };

  // On hover over the 'info' button, to preview the prompts that will be sent out
  const [promptPreviews, setPromptPreviews] = useState([]);
  const handlePreviewHover = () => {
    // Pull input data and prompt
    const [root_prompt, pulled_vars] = pullInputData();
    fetch_from_backend('generatePrompts', {
      prompt: root_prompt,
      vars: pulled_vars,
    }).then(prompts => {
      setPromptPreviews(prompts.map(p => (new PromptInfo(p))));
    });
    // console.error("preview prompts:");
    // console.error(promptPreviews);
  };

  const handleTextInputChange = (event) => {
    const value = event.currentTarget.value;

    // Store prompt text
    setPromptText(value);
    data['prompt'] = value;

    // Update status icon, if need be:
    if (promptTextOnLastRun !== null) {
      if (status !== 'warning' && value !== promptTextOnLastRun) {
        setStatus('warning');
      } else if (status === 'warning' && value === promptTextOnLastRun) {
        setStatus('ready');
      }
    }

    refreshTemplateHooks(value);
  };

  const handleToolTypeInputChange = (event) => {
    const value = event.currentTarget.value;
    setToolType(value);
    setAvailableModels(ToolType2Models[value]);
    // console.error('change tool type:');
    // console.error(toolType);
  };

  const handleModelInputChange = (event) => {
    const value = event.target.value;
    // Store model id
    setModelID(value);
    data['model'] = value;
    // console.error('change model id:');
    // console.error(modelID);
  };

  const validateInputOuputTypes = (toolType) => {
    const expectedInputType = ToolType2IOType[toolType].input_type;
    const expectedOutputType = ToolType2IOType[toolType].output_type;
    const res = (inputNode.type === expectedInputType && outputNode.type === expectedOutputType);
    let msg = '';
    if (!res) {
      msg = `Expected input & output types are: ${expectedInputType} & ${expectedOutputType}, but actual types are ${inputNode.type} & ${outputNode.type}.`;
    }
    return [res, msg];
  }

  const handleRunClick = async (event) => {
    setInputOutputNodes();
    const hf = new HfInference(); // Optional: add your own API to avoid rate limiting
    if (!inputNode || !outputNode) {
      // console.error(inputNode);
      // console.error(outputNode);
      const inMsg = inputNode ? "" : "You haven't specified the input(s) yet. \nPlease add an input node and connect it to this one.\n"
      const outMsg = outputNode ? "" : "You don't want to lose your output(s)! \nPlease add an output node."
      alertModal.current.trigger(inMsg + outMsg);
    } else {
      const [ioTypeValid, msg] = validateInputOuputTypes(toolType);
      if (!ioTypeValid) {
        alertModal.current.trigger(msg);
      } else if (inputNode.type === 'image' && !inputNode.data.image) {
        alertModal.current.trigger("Please upload an image file in the image input node.");
        // console.error(inputNode.data.image);
      } else {
        setImage(inputNode.data.image);

        let out;
        // console.error(promptText);
        const selectedModelID = document.getElementById(id + "model").value;
        setModelID(selectedModelID);
        // console.error(selectedModelID);
        // console.error(modelID);

        // A hacky way to obtain the full prompt! 
        const fullPrompt = promptPreviews[0].prompt;
        console.error(fullPrompt);

        try {
          if (outputNode.type === "image") {
            if (toolType === "Image-to-image") {
              // console.error(image);
              out = await hf.imageToImage({
                inputs: image,
                parameters: {
                  prompt: fullPrompt,
                },
                model: modelID,
              });
              // console.error(out);
              const url = URL.createObjectURL(out);
              const img = outputNode ? document.getElementById(outputNode.id + "imageout") : document.getElementById(id + "imageout");
              img.setAttribute("src", url);
            } else if (toolType === "Text-to-image") {
              out = await hf.textToImage({
                inputs: fullPrompt,
                model: modelID,
              });
              // console.error(out);
            } else {
              alertModal.current.trigger("This tool has not been implemented yet.");
            }
            const url = URL.createObjectURL(out);
            const img = outputNode ? document.getElementById(outputNode.id + "imageout") : document.getElementById(id + "imageout");
            img.setAttribute("src", url);
          } else if (outputNode.type === "text") {
            if (toolType === "Image-to-text") {
              // console.error(image);
              const res = await hf.imageToText({
                data: image,
                model: modelID,
              });
              out = res.generated_text;

            } else if (toolType === "Text translation") {
              const res = await hf.translation({
                model: modelID,
                inputs: fullPrompt
              });
              out = res.translation_text;
            } else {
              const res = await hf.textGeneration({
                model: modelID,
                inputs: fullPrompt
              });
              out = res.generated_text;
            }
            console.error(out);
            const textOutElem = document.getElementById(outputNode.id + "textout");
            // textOutElem.innerHTML = out;
            textOutElem.value = out;
          }
        } catch (err) {
          alertModal.current.trigger(err.message);
        }
      }
    }

  }
  return (
    <div className="cfnode">
      <NodeLabel title={data.title || 'Language Translation'}
        nodeId={id}
        icon={<IconLanguage size="16px" />}
        handleRunClick={handleRunClick}
        alertModal={alertModal}
        customButtons={[
          <PromptListPopover promptInfos={promptPreviews} onHover={handlePreviewHover} onClick={openInfoModal} />
        ]}
      />
      {/* <NativeSelect
        withAsterisk
        value={toolType}
        // onChange={(event) => {setToolType(event.currentTarget.value)}}
        data={AvailableTools}
        label="Select tool type:"
        onChange={handleToolTypeInputChange}
      /> */}

      <div style={{ backgroundColor: "#f5f5f5", padding: "10px", borderRadius: "5px" }}>
      <Grid>
        <Grid.Col span={6}>
        <NativeSelect
          id={"input-language"}
          label="Input Language:"
          data={InputLanguages}
          size="xs"
          // onChange={handleModelInputChange}
        />
        </Grid.Col>
        <Grid.Col span={6}>
          <NativeSelect
          id={"output-language"}
          label="Output Language:"
          data={OutputLanguages}
          size="xs"
          // onChange={handleModelOutputChange}
        />
        </Grid.Col>
      </Grid>

      <NativeSelect
          id={"model-hub"}
          label="Model Hub:"
          data={ModelHubs}
          size="xs"
          // onChange={handleModelOutputChange}
        />
      </div>

      <Space h="xs" />
      
      
      <NativeSelect
        withAsterisk
        id={id + "model"}
        data={availableModels.map((x) => (x.model))}
        label="Select model:"
        // onChange={handleModelInputChange}
        value={modelID}
        onChange={(event) => setModelID(event.currentTarget.value)}
      />
      {/* <hr />
      {toolType !== "Image-to-text" ?
        <div >
          Prompt: <br />
          <textarea
            rows="4"
            cols="40"
            defaultValue={data.prompt}
            onChange={handleTextInputChange}
            className="nodrag nowheel"
          />
        </div> :
        <div></div>
      } */}
      
        <Handle
          type="target"
          position="left"
          id="input"
          style={{ top: '50%', background: '#555' }}
        />
      <Handle
        type="source"
        position="right"
        id="prompt"
        style={{ top: '50%', background: '#555' }}
      />
    </div>
  );
}

export default TextTranslation;
