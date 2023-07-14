import { useState, useEffect, useRef } from 'react';
import { IconTools } from '@tabler/icons-react';
import { NativeSelect } from '@mantine/core';
import NodeLabel from './NodeLabelComponent';
import { HfInference } from '@huggingface/inference';
import TemplateHooks, { extractBracketedSubstrings } from './TemplateHooksComponent'
import { Handle } from 'react-flow-renderer';
import useStore from './store';
import { AvailableTools, ToolType2Models, ToolType2IOType} from './ToolSettingSchemas';

const ToolNode = ({ data, id }) => {
    const edges = useStore((state) => state.edges);
    const getNode = useStore((state) => state.getNode);

    const [image, setImage] = useState(data.image || null);
    // const [imageOut, setImageOut] = useState(null);
    const [templateVars, setTemplateVars] = useState(data.vars || []);
    const [promptText, setPromptText] = useState(data.prompt || "");
    const [modelID, setModelID] = useState(data.model || ToolType2Models["Text generation"][0].model);
    const [toolType, setToolType] = useState(data.tooltype || "Text generation");
    const [availableModels, setAvailableModels] = useState(ToolType2Models["Text generation"]);
    const [promptTextOnLastRun, setPromptTextOnLastRun] = useState(null);
    const [status, setStatus] = useState('none');
    const [inputNode, setInputNode] = useState(null);
    const [outputNode, setOutputNode] = useState(null);
    // For displaying error messages to user
    const alertModal = useRef(null);

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
      const inMsg = inputNode? "" : "You haven't specified the input(s) yet. \nPlease add an input node and connect it to this one.\n"
      const outMsg = outputNode? "" : "You don't want to lose your output(s)! \nPlease add an output node."
      alertModal.current.trigger(inMsg + outMsg);
    } else {
      const [ioTypeValid, msg] = validateInputOuputTypes(toolType);
      if (!ioTypeValid) {
        alertModal.current.trigger(msg);
      } else if (inputNode.type === 'image' && !inputNode.data.image) {
        alertModal.current.trigger("Please upload an image file in the image input node.");
        // console.error(inputNode.data.image);
      } else {
      // console.error(inputNode.data.image);
      setImage(inputNode.data.image);

      let out = image;
      // console.error(promptText);
      const selectedModelID = document.getElementById(id+"model").value;
      setModelID(selectedModelID);
      // console.error(selectedModelID);
      // console.error(modelID);

      try {
      if (promptText) {
        if (image) {
          // console.error(image);
          out = await hf.imageToImage({
              inputs: image,
              parameters: {
              prompt: promptText,
              },
              model: modelID, 
          });
        } else {
          out = await hf.textToImage({
            inputs: promptText,
            model: modelID,
          });
        }
        // console.error(out);
        const url = URL.createObjectURL(out);
        const img = outputNode? document.getElementById(outputNode.id + "imageout"): document.getElementById(id + "imageout");
        img.setAttribute("src", url);
      } else {
        // console.error(image);
        if (image) {
          const res = await hf.imageToText({
            data: image,
            model: modelID,
        });
          out = res.generated_text;
          console.error(out);
          const textOutElem = document.getElementById(outputNode.id + "textout");
          textOutElem.innerHTML = out;
        }
      }
      } catch (err) {
          alertModal.current.trigger(err.message);
      }
    }
  }
  
  }
    return (
        <div className="cfnode">
            <NodeLabel title={data.title || 'Tool Node'} 
                nodeId={id} 
                icon={<IconTools size="16px" />} 
                handleRunClick={handleRunClick}
                alertModal={alertModal}
                />
        <NativeSelect
      withAsterisk
      value={toolType}
      // onChange={(event) => {setToolType(event.currentTarget.value)}}
      data={AvailableTools}
      label="Select tool type:"
      onChange={handleToolTypeInputChange}
    />
     <NativeSelect
      withAsterisk
      id={id+"model"}
      data={availableModels.map((x) => (x.model))}
      label="Select model:"
      // onChange={handleModelInputChange}
      value={modelID}
      onChange={(event) => setModelID(event.currentTarget.value)}
    />
     <hr />
     {toolType !== "Image-to-text"?
        <div >
        Prompt: <br />
        <textarea
          rows="4"
          cols="40"
          defaultValue={data.prompt}
          onChange={handleTextInputChange}
          className="nodrag nowheel"
        />
        </div>:
        <div></div>
     }
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
      
      <TemplateHooks vars={templateVars} nodeId={id} startY={138} />
        </div>
    );
}

export default ToolNode;
