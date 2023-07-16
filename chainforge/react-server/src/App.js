// import logo from './logo.svg';
// import './App.css';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
} from 'react-flow-renderer';
import { Button, Menu, LoadingOverlay, Text, Box, List, Loader, Drawer, Space, Flex} from '@mantine/core';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import { IconSettings, IconTextPlus, IconTerminal, IconCsv, IconSettingsAutomation, IconFileSymlink, IconTools, IconPhoto, IconLanguage, IconWriting, IconRegex, IconLogin, IconBrush, IconPictureInPictureOn, IconTextCaption, IconBrandPython, IconBrandJavascript, IconCalculator, IconWorldWww, IconBrandGoogleMaps, IconSearch, IconChartBar, IconColumns, IconMessage2} from '@tabler/icons-react';
import TextFieldsNode from './TextFieldsNode'; // Import a custom node
import PromptNode from './PromptNode';
// import ModelToolNode from './ModelToolNode'
// import CodeToolNode from './CodeToolNode'
import ImageNode from './ImageNode';

import ToolNode from './ToolNode';
import TextTranslation from './tools/TextTranslation';
import TextGeneration from './tools/TextGeneration';

import EvaluatorNode from './EvaluatorNode';
import VisNode from './VisNode';
import InspectNode from './InspectorNode';
import ScriptNode from './ScriptNode';
import AlertModal from './AlertModal';
import CsvNode from './CsvNode';
import TabularDataNode from './TabularDataNode';
import CommentNode from './CommentNode';
import GlobalSettingsModal from './GlobalSettingsModal';
import ExampleFlowsModal from './ExampleFlowsModal';
import AreYouSureModal from './AreYouSureModal';
import { getDefaultModelFormData, getDefaultModelSettings } from './ModelSettingSchemas';
import { v4 as uuid } from 'uuid';
import LZString from 'lz-string';
import { EXAMPLEFLOW_1 } from './example_flows';
import './text-fields-node.css';

import bouquetlogo from './bouquet.png';
import bouquetlogo1 from './bouquet_1.png';

// State management (from https://reactflow.dev/docs/guides/state-management/)
import { shallow } from 'zustand/shallow';
import useStore from './store';
import fetch_from_backend from './fetch_from_backend';
import StorageCache from './backend/cache';
import { APP_IS_RUNNING_LOCALLY } from './backend/utils';

// Device / Browser detection
import { isMobile, isChrome, isFirefox } from 'react-device-detect';
const IS_ACCEPTED_BROWSER = (isChrome || isFirefox) && !isMobile;

const selector = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
  addNode: state.addNode,
  setNodes: state.setNodes,
  setEdges: state.setEdges,
  resetLLMColors: state.resetLLMColors,
});

// The initial LLM to use when new flows are created, or upon first load
const INITIAL_LLM = () => {
  let falcon7b = {
    key: uuid(),
    name: "Falcon.7B.Instruct",
    emoji: "🤗",
    model: "tiiuae/falcon-7b-instruct",
    base_model: "hf",
    temp: 1.0,
    settings: getDefaultModelSettings('hf'),
    formData: getDefaultModelFormData('hf'),
  };
  falcon7b.formData.shortname = falcon7b.name;
  falcon7b.formData.model = falcon7b.model;
  return falcon7b;
};

// import AnimatedConnectionLine from './AnimatedConnectionLine';

const nodeTypes = {
  textfields: TextFieldsNode, // Register the custom node
  text: TextFieldsNode,
  image: ImageNode,
  prompt: PromptNode,
  tool: ToolNode,
  texttranslation: TextTranslation,
  textgeneration: TextGeneration,
  // modeltool: ModelToolNode,
  // codetool: CodeToolNode,
  evaluator: EvaluatorNode,
  vis: VisNode,
  inspect: InspectNode,
  script: ScriptNode,
  csv: CsvNode,
  table: TabularDataNode,
  comment: CommentNode,
};

// Whether we are running on localhost or not, and hence whether
// we have access to the Flask backend for, e.g., Python code evaluation.
const IS_RUNNING_LOCALLY = APP_IS_RUNNING_LOCALLY();

// Try to get a GET param in the URL, representing the shared flow. 
// Returns undefined if not found.  
const getSharedFlowURLParam = () => {
  // Get the current URL
  const curr_url = new URL(window.location.href);

  // Get the search parameters from the URL
  const params = new URLSearchParams(curr_url.search);

  // Try to retrieve an 'f' parameter (short for flow)
  const shared_flow_uid = params.get('f');

  if (shared_flow_uid) {
    // Check if it's a base36 string:
    const is_base36 = /^[0-9a-z]+$/i;
    if (shared_flow_uid.length > 1 && is_base36.test(shared_flow_uid))
      return shared_flow_uid;
  }
  return undefined;
};

// const connectionLineStyle = { stroke: '#ddd' };
const snapGrid = [16, 16];
let saveIntervalInitialized = false;

const App = () => {

  // Get nodes, edges, etc. state from the Zustand store:
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, setNodes, setEdges, resetLLMColors } = useStore(selector, shallow);

  // For saving / loading
  const [rfInstance, setRfInstance] = useState(null);
  const [autosavingInterval, setAutosavingInterval] = useState(null);

  // For 'share' button
  const clipboard = useClipboard({ timeout: 1500 });
  const [waitingForShare, setWaitingForShare] = useState(false);

  // For modal popup to set global settings like API keys
  const settingsModal = useRef(null);

  // For modal popup of example flows
  const examplesModal = useRef(null);

  // For an info pop-up that welcomes new users
  // const [welcomeModalOpened, { open: openWelcomeModal, close: closeWelcomeModal }] = useDisclosure(false);

  // For confirmation popup
  const confirmationModal = useRef(null);
  const [confirmationDialogProps, setConfirmationDialogProps] = useState({
    title: 'Confirm action', message: 'Are you sure?', onConfirm: () => { }
  });

  // For displaying error messages to user
  const alertModal = useRef(null);

  // For displaying a pending 'loading' status
  const [isLoading, setIsLoading] = useState(true);

  // Helper 
  const getWindowSize = () => ({ width: window.innerWidth, height: window.innerHeight });
  const getWindowCenter = () => {
    const { width, height } = getWindowSize();
    return ({ centerX: width / 2.0, centerY: height / 2.0 });
  }
  const getViewportCenter = () => {
    const { centerX, centerY } = getWindowCenter();
    const { x, y } = rfInstance.getViewport();
    return ({ x: -x + centerX, y: -y + centerY });
  }

  const addTextFieldsNode = (ioType) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'textFieldsNode-' + Date.now(), type: 'text', data: { iotype: ioType }, position: { x: x - 200, y: y - 100 } });
  };
  const addPromptNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'promptNode-' + Date.now(), type: 'prompt', data: { prompt: '' }, position: { x: x - 200, y: y - 100 } });
  };
  const addImageNode = (ioType) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'imageNode-' + Date.now(), type: 'image', data: { iotype: ioType }, position: { x: x - 200, y: y - 100 } });
  };
  const addToolNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'toolNode-' + Date.now(), type: 'tool', data: {}, position: { x: x - 200, y: y - 100 } });
  };

  const addTextTranslationNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'textTranslationNode-' + Date.now(), type: 'texttranslation', data: {}, position: { x: x - 200, y: y - 100 } });
  };

  const addTextGenerationNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'textGenerationNode-' + Date.now(), type: 'textgeneration', data: {}, position: { x: x - 200, y: y - 100 } });
  };
  // const addModelToolNode = (event) => {
  //   const { x, y } = getViewportCenter();
  //   addNode({ id: 'modelToolNode-'+Date.now(), type: 'modeltool', data: {}, position: {x: x-200, y:y-100} });
  // };
  // const addCodeToolNode = (progLang) => {
  //   const { x, y } = getViewportCenter();
  //   let code = "";
  //   if (progLang === 'python') 
  //     code = "def evaluate(response):\n  return len(response.text)";
  //   else if (progLang === 'javascript')
  //     code = "function evaluate(response) {\n  return response.text.length;\n}";
  //   addNode({ id: 'codeToolNode-'+Date.now(), type: 'codetool', data: { language: progLang, code: code }, position: {x: x-200, y:y-100} });
  // };
  const addEvalNode = (progLang) => {
    const { x, y } = getViewportCenter();
    let code = "";
    if (progLang === 'python')
      code = "def evaluate(response):\n  return len(response.text)";
    else if (progLang === 'javascript')
      code = "function evaluate(response) {\n  return response.text.length;\n}";
    addNode({ id: 'evalNode-' + Date.now(), type: 'evaluator', data: { language: progLang, code: code }, position: { x: x - 200, y: y - 100 } });
  };
  const addVisNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'visNode-' + Date.now(), type: 'vis', data: {}, position: { x: x - 200, y: y - 100 } });
  };
  const addInspectNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'inspectNode-' + Date.now(), type: 'inspect', data: {}, position: { x: x - 200, y: y - 100 } });
  };
  const addScriptNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'scriptNode-' + Date.now(), type: 'script', data: {}, position: { x: x - 200, y: y - 100 } });
  };
  const addCsvNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'csvNode-' + Date.now(), type: 'csv', data: {}, position: { x: x - 200, y: y - 100 } });
  };
  const addTabularDataNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'table-' + Date.now(), type: 'table', data: {}, position: { x: x - 200, y: y - 100 } });
  };
  const addCommentNode = (event) => {
    const { x, y } = getViewportCenter();
    addNode({ id: 'comment-' + Date.now(), type: 'comment', data: {}, position: { x: x - 200, y: y - 100 } });
  };

  const onClickExamples = () => {
    if (examplesModal && examplesModal.current)
      examplesModal.current.trigger();
  };
  const onClickSettings = () => {
    if (settingsModal && settingsModal.current)
      settingsModal.current.trigger();
  };

  const handleError = (err) => {
    setIsLoading(false);
    setWaitingForShare(false);
    if (alertModal.current)
      alertModal.current.trigger(err.message);
    console.error(err.message);
  };

  /** 
   * SAVING / LOADING, IMPORT / EXPORT (from JSON)
  */
  const downloadJSON = (jsonData, filename) => {
    // Convert JSON object to JSON string
    const jsonString = JSON.stringify(jsonData, null, 2);

    // Create a Blob object from the JSON string
    const blob = new Blob([jsonString], { type: "application/json" });

    // Create a temporary download link
    const downloadLink = document.createElement("a");
    downloadLink.href = URL.createObjectURL(blob);
    downloadLink.download = filename;

    // Add the link to the DOM (it's not visible)
    document.body.appendChild(downloadLink);

    // Trigger the download by programmatically clicking the temporary link
    downloadLink.click();

    // Remove the temporary link from the DOM and revoke the URL
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(downloadLink.href);
  };

  // Save the current flow to localStorage for later recall. Useful to getting
  // back progress upon leaving the site / browser crash / system restart.
  const saveFlow = useCallback((rf_inst) => {
    const rf = rf_inst || rfInstance;
    if (!rf) return;
    // NOTE: This currently only saves the front-end state. Cache files
    // are not pulled or overwritten upon loading from localStorage. 
    const flow = rf.toObject();
    localStorage.setItem('chainforge-flow', JSON.stringify(flow));

    // Attempt to save the current state of the back-end state,
    // the StorageCache. (This does LZ compression to save space.)
    StorageCache.saveToLocalStorage('chainforge-state');

    console.log('Flow saved!');
  }, [rfInstance]);

  // Triggered when user confirms 'New Flow' button
  const resetFlow = useCallback(() => {
    resetLLMColors();

    const uid = (id) => `${id}-${Date.now()}`;
    const starting_nodes = [
      {
        id: uid('prompt'), type: 'prompt', data: {
          prompt: 'Why is the sky blue?',
          n: 1,
          llms: [INITIAL_LLM()]
        },
        position: { x: 450, y: 200 }
      },
      { id: uid('textfields'), type: 'textfields', data: {}, position: { x: 80, y: 270 } },
    ];

    setNodes(starting_nodes);
    setEdges([]);
    if (rfInstance)
      rfInstance.setViewport({ x: 200, y: 80, zoom: 1 });
  }, [setNodes, setEdges, resetLLMColors, rfInstance]);

  const loadFlow = async (flow, rf_inst) => {
    if (flow) {
      if (rf_inst) {
        if (flow.viewport)
          rf_inst.setViewport({ x: flow.viewport.x || 0, y: flow.viewport.y || 0, zoom: 1 });
        else
          rf_inst.setViewport({ x: 0, y: 0, zoom: 1 });
      }
      resetLLMColors();
      setNodes(flow.nodes || []);
      setEdges(flow.edges || []);

      // Save flow that user loaded to autosave cache, in case they refresh the browser
      localStorage.setItem('chainforge-flow', JSON.stringify(flow));
      StorageCache.saveToLocalStorage('chainforge-state');
    }
  };
  const autosavedFlowExists = () => {
    return localStorage.getItem('chainforge-flow') !== null;
  };
  const loadFlowFromAutosave = async (rf_inst) => {
    const saved_flow = localStorage.getItem('chainforge-flow');
    if (saved_flow) {
      StorageCache.loadFromLocalStorage('chainforge-state');
      loadFlow(JSON.parse(saved_flow), rf_inst);
    }
  };

  // const openDrawer = () => {

  // };

  // Export / Import (from JSON)
  const exportFlow = useCallback(() => {
    if (!rfInstance) return;

    // We first get the data of the flow
    const flow = rfInstance.toObject();

    // Then we grab all the relevant cache files from the backend
    const all_node_ids = nodes.map(n => n.id);
    fetch_from_backend('exportCache', {
      'ids': all_node_ids,
    }).then(function (json) {
      if (!json || !json.files)
        throw new Error('Request was sent and received by backend server, but there was no response.');

      // Now we append the cache file data to the flow
      const flow_and_cache = {
        flow: flow,
        cache: json.files,
      };

      // Save!
      downloadJSON(flow_and_cache, `flow-${Date.now()}.cforge`);
    }).catch(handleError);
  }, [rfInstance, nodes, handleError]);

  // Import data to the cache stored on the local filesystem (in backend)
  const importCache = useCallback((cache_data) => {
    return fetch_from_backend('importCache', {
      'files': cache_data,
    }).then(function (json) {
      if (!json || json.result === undefined)
        throw new Error('Request to import cache data was sent and received by backend server, but there was no response.');
      else if (json.error || json.result === false)
        throw new Error('Error importing cache data:' + json.error);
      // Done! 
    }).catch(handleError);
  }, [handleError]);

  const importFlowFromJSON = useCallback((flowJSON, rf_inst) => {
    const rf = rf_inst || rfInstance;

    // Detect if there's no cache data
    if (!flowJSON.cache) {
      // Support for loading old flows w/o cache data:
      loadFlow(flowJSON, rf);
      return;
    }

    // Then we need to extract the JSON of the flow vs the cache data
    const flow = flowJSON.flow;
    const cache = flowJSON.cache;

    // We need to send the cache data to the backend first,
    // before we can load the flow itself...
    importCache(cache).then(() => {
      // We load the ReactFlow instance last
      loadFlow(flow, rf);
    }).catch(err => {
      // On an error, still try to load the flow itself:
      handleError("Error encountered when importing cache data:" + err.message + "\n\nTrying to load flow regardless...");
      loadFlow(flow, rf);
    });
  }, [rfInstance]);

  // Import a ChainForge flow from a file
  const importFlowFromFile = async () => {
    // Create an input element with type "file" and accept only JSON files
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".cforge, .json";

    // Handle file selection
    input.addEventListener("change", function (event) {

      const file = event.target.files[0];
      const reader = new FileReader();

      // Handle file load event
      reader.addEventListener("load", function () {
        try {
          // We try to parse the JSON response
          const flow_and_cache = JSON.parse(reader.result);

          // Import it to React Flow and import cache data on the backend
          importFlowFromJSON(flow_and_cache);

        } catch (error) {
          handleError(error);
        }
      });

      // Read the selected file as text
      reader.readAsText(file);
    });

    // Trigger the file selector
    input.click();
  };

  // Downloads the selected OpenAI eval file (preconverted to a .cforge flow)
  const importFlowFromOpenAIEval = (evalname) => {
    fetch_from_backend('fetchOpenAIEval', {
      name: evalname,
    }, handleError).then(function (json) {
      // Close the loading modal
      setIsLoading(false);

      // Detect any issues with the response
      if (!json) {
        handleError('Request was sent and received by backend server, but there was no response.');
        return undefined;
      } else if (json.error || !json.data) {
        handleError(json.error || 'Unknown error when fetching file for OpenAI eval from backend server.');
        return undefined;
      }

      // Import the JSON to React Flow and import cache data on the backend
      importFlowFromJSON(json.data);
    }).catch(handleError);
  };

  // Load flow from examples modal
  const onSelectExampleFlow = (name, example_category) => {
    // Trigger the 'loading' modal
    setIsLoading(true);

    // Detect a special category of the example flow, and use the right loader for it:
    if (example_category === 'openai-eval') {
      importFlowFromOpenAIEval(name);
      return;
    }

    // Fetch the example flow data from the backend
    fetch_from_backend('fetchExampleFlow', {
      'name': name,
    }, handleError).then(function (json) {
      // Close the loading modal
      setIsLoading(false);

      if (!json)
        throw new Error('Request to fetch example flow was sent to backend server, but there was no response.');
      else if (json.error || !json.data)
        throw new Error('Error importing example flow:' + json.error);

      // We have the data, import it:
      importFlowFromJSON(json.data);

    }, handleError).catch(handleError);
  };

  // When the user clicks the 'New Flow' button
  const onClickNewFlow = useCallback(() => {
    setConfirmationDialogProps({
      title: 'Create a new flow',
      message: 'Are you sure? Any unexported changes to your existing flow will be lost.',
      onConfirm: () => resetFlow(), // Set the callback if user confirms action
    });

    // Trigger the 'are you sure' modal:
    if (confirmationModal && confirmationModal.current)
      confirmationModal.current.trigger();
  }, [confirmationModal, resetFlow, setConfirmationDialogProps]);

  // When the user clicks the 'Share Flow' button
  const onClickShareFlow = useCallback(async () => {
    if (IS_RUNNING_LOCALLY) {
      handleError(new Error('Cannot upload flow to server database when running locally: Feature only exists on hosted version of ChainForge.'));
      return;
    } else if (waitingForShare === true) {
      handleError(new Error('A share request is already in progress. Wait until the current share finishes before clicking again.'));
      return;
    }

    // Helper function
    function isFileSizeLessThan5MB(str) {
      const encoder = new TextEncoder();
      const encodedString = encoder.encode(str);
      const fileSizeInBytes = encodedString.length;
      const fileSizeInMB = fileSizeInBytes / (1024 * 1024); // Convert bytes to megabytes
      return fileSizeInMB < 5;
    }

    setWaitingForShare(true);

    // Package up the current flow:
    const flow = rfInstance.toObject();
    const all_node_ids = nodes.map(n => n.id);
    const cforge_data = await fetch_from_backend('exportCache', {
      'ids': all_node_ids,
    }).then(function (json) {
      if (!json || !json.files)
        throw new Error('There was no response from the backend.');

      // Now we append the cache file data to the flow
      return {
        flow: flow,
        cache: json.files,
      };
    }).catch(handleError);

    if (!cforge_data) return;

    // Compress the data and check it's compressed size < 5MB:
    const compressed = LZString.compressToUTF16(JSON.stringify(cforge_data));
    if (!isFileSizeLessThan5MB(compressed)) {
      handleError(new Error("Flow filesize exceeds 5MB. You can only share flows up to 5MB or less. But, don't despair! You can still use 'Export Flow' to share your flow manually as a .cforge file."))
      return;
    }

    // Try to upload the compressed cforge data to the server:
    fetch('/db/shareflow.php', {
      method: 'POST',
      body: compressed
    })
      .then(r => r.text())
      .then(uid => {
        if (!uid) {
          throw new Error("Received no response from server.");
        } else if (uid.startsWith('Error')) {
          // Error encountered during the query; alert the user
          // with the error message:
          throw new Error(uid);
        }

        // Share completed!
        setWaitingForShare(false);

        // The response should be a uid we can put in a GET request.
        // Generate the link:
        let base_url = new URL(window.location.origin + window.location.pathname); // the current address e.g., https://chainforge.ai/play
        let get_params = new URLSearchParams(base_url.search);
        // Add the 'f' parameter
        get_params.set('f', uid); // set f=uid
        // Update the URL with the modified search parameters
        base_url.search = get_params.toString();
        // Get the modified URL
        const get_url = base_url.toString();

        // Copies the GET URL to user's clipboard
        // and updates the 'Share This' button state:
        clipboard.copy(get_url);
      })
      .catch(err => {
        handleError(err);
      });

  }, [rfInstance, nodes, IS_RUNNING_LOCALLY, handleError, clipboard, waitingForShare]);

  // Run once upon ReactFlow initialization
  const onInit = (rf_inst) => {
    setRfInstance(rf_inst);

    // Autosave the flow to localStorage every minute:
    console.log('set autosaving interval');
    const interv = setInterval(() => saveFlow(rf_inst), 60000); // 60000 milliseconds = 1 minute
    setAutosavingInterval(interv);

    if (!IS_RUNNING_LOCALLY) {

      // Check if there's a shared flow UID in the URL as a GET param
      // If so, we need to look it up in the database and attempt to load it:
      const shared_flow_uid = getSharedFlowURLParam();
      if (shared_flow_uid !== undefined) {
        try {
          // The format passed a basic smell test;
          // now let's query the server for a flow with that UID:
          fetch('/db/get_sharedflow.php', {
            method: 'POST',
            body: shared_flow_uid,
          })
            .then(r => r.text())
            .then(response => {
              if (!response || response.startsWith('Error')) {
                // Error encountered during the query; alert the user
                // with the error message:
                handleError(new Error(response || 'Unknown error'));
                return;
              }

              // Attempt to parse the response as a compressed flow + import it:
              try {
                const cforge_json = JSON.parse(LZString.decompressFromUTF16(response));
                importFlowFromJSON(cforge_json, rf_inst);
                setIsLoading(false);
              } catch (err) {
                handleError(err);
              }
            })
            .catch(err => {
              handleError(err);
            });
        } catch (err) {
          // Soft fail
          setIsLoading(false);
          console.error(err);
        }

        // Since we tried to load from the shared flow ID, don't try to load from autosave
        return;
      }
    }

    // Attempt to load an autosaved flow, if one exists:
    if (autosavedFlowExists())
      loadFlowFromAutosave(rf_inst);
    else {
      // Load an interesting default starting flow for new users
      importFlowFromJSON(EXAMPLEFLOW_1, rf_inst);

      // Open a welcome pop-up
      // openWelcomeModal();
    }

    // Turn off loading wheel
    setIsLoading(false);
  };

  useEffect(() => {
    // Cleanup the autosaving interval upon component unmount:
    return () => {
      clearInterval(autosavingInterval); // Clear the interval when the component is unmounted
    };
  }, []);

  const [opened, { open, close }] = useDisclosure(false);

  const content = (
    <Box>
      <Text size={'16pt'} fw={700}><IconTools size="18px" /> Tool Store</Text>
      <Text mt="sm" size={'9pt'}>Drag and drop the input and output nodes to the canvas to begin. The input and output nodes are the entry and exit points of your flow. You can connect them to other nodes to create a flow.</Text>
      
      <Text mt="lg" mb="xs" size={'9pt'} tt="uppercase" fw={700} c="dimmed">Input / Output</Text>
      <Flex
        mih={35}
        gap="xs"
        justify="flex-start"
        align="center"
        direction="row"
        wrap="wrap"
      >
        <Button onClick={() => addTextFieldsNode('input')} icon={<IconTextPlus size="16px" />} variant="light" compact><IconTextPlus size="16px" /><Space w="xs" />Text Input</Button>
        <Button onClick={() => addTextFieldsNode('output')} icon={<IconTextPlus size="16px" />} variant="light" compact><IconTextPlus size="16px" /><Space w="xs" />Text Output</Button>
        <Button onClick={() => addImageNode('input')} icon={<IconTextPlus size="16px" />} variant="light" compact><IconPhoto size="16px" /><Space w="xs" />Image Input</Button>
        <Button onClick={() => addImageNode('output')} variant="light" compact><IconPhoto size="16px" /><Space w="xs" />Image Output</Button>
        <Button onClick={addVisNode} variant="light" compact><IconChartBar size="16px" /><Space w="xs" />Visualize Output</Button>
        <Button onClick={addTabularDataNode} variant="light" compact><IconColumns size="16px" /><Space w="xs" />Tabular Input</Button>
        <Button onClick={addCommentNode} variant="light" compact><IconMessage2 size="16px" /><Space w="xs" />Comment</Button>
        <Button onClick={addInspectNode} variant="light" compact><IconSearch size="16px" /><Space w="xs" />Inspect Node</Button>

      </Flex>

      <Text mt="lg" mb="xs" size={'9pt'} tt="uppercase" fw={700} c="dimmed">Models</Text>
      <Flex
        mih={35}
        gap="xs"
        justify="flex-start"
        align="center"
        direction="row"
        wrap="wrap"
      >
        <Button onClick={addTextTranslationNode} icon={<IconTextPlus size="16px" />} variant="light" compact><IconLanguage size="16px" /><Space w="xs" />Language Translation</Button>
        <Button onClick={addTextGenerationNode} icon={<IconTextPlus size="16px" />} variant="light" compact><IconWriting size="16px" /><Space w="xs" />Text Generation</Button>
        <Button onClick={addTextGenerationNode} icon={<IconTextPlus size="16px" />} variant="light" compact><IconBrush size="16px" /><Space w="xs" />Generate Image</Button>
        <Button onClick={addTextGenerationNode} icon={<IconTextPlus size="16px" />} variant="light" compact><IconTextCaption size="16px" /><Space w="xs" />Caption Image</Button>
        <Button onClick={addTextGenerationNode} icon={<IconTextPlus size="16px" />} variant="light" compact><IconPictureInPictureOn size="16px" /><Space w="xs" />Convert Image</Button>
      </Flex>

      <Text mt="lg" mb="xs" size={'9pt'} tt="uppercase" fw={700} c="dimmed">Code Compilers</Text>
      <Flex
        mih={35}
        gap="xs"
        justify="flex-start"
        align="center"
        direction="row"
        wrap="wrap"
      >
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconBrandPython size="16px" /><Space w="xs" />Python</Button>
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconBrandJavascript size="16px" /><Space w="xs" />Javascript</Button>
      </Flex>

      <Text mt="lg" mb="xs" size={'9pt'} tt="uppercase" fw={700} c="dimmed">Processors</Text>
      <Flex
        mih={35}
        gap="xs"
        justify="flex-start"
        align="center"
        direction="row"
        wrap="wrap"
      >
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconRegex size="16px" /><Space w="xs" />Regex</Button>
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconLogin size="16px" /><Space w="xs" />Mask</Button>
      </Flex>

      <Text mt="lg" mb="xs" size={'9pt'} tt="uppercase" fw={700} c="dimmed">Tools</Text>
      <Flex
        mih={35}
        gap="xs"
        justify="flex-start"
        align="center"
        direction="row"
        wrap="wrap"
      >
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconCalculator size="16px" /><Space w="xs" />Calculator</Button>
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconWorldWww size="16px" /><Space w="xs" />Search</Button>

      </Flex>

      <Text mt="lg" mb="xs" size={'9pt'} tt="uppercase" fw={700} c="dimmed">Specific APIs</Text>
      <Flex
        mih={35}
        gap="xs"
        justify="flex-start"
        align="center"
        direction="row"
        wrap="wrap"
      >
        <Button icon={<IconTextPlus size="16px" />} variant="light" compact><IconBrandGoogleMaps size="16px" /><Space w="xs" />Google Maps</Button>

      </Flex>


      
    </Box>
  );

  if (!IS_ACCEPTED_BROWSER) {
    return (
      <Box maw={600} mx='auto' mt='40px'>
        <Text m='xl' size={'11pt'}>We're sorry, but it seems like {isMobile ? "you are viewing ChainForge on a mobile device" : "your current browser isn't supported by the current version of ChainForge"} 😔.
          We want to provide you with the best experience possible, so we recommend {isMobile ? "viewing ChainForge on a desktop browser" : ""} using one of our supported browsers listed below:</Text>
        <List m='xl' size={'11pt'}>
          <List.Item>Google Chrome</List.Item>
          <List.Item>Mozilla Firefox</List.Item>
        </List>

        <Text m='xl' size={'11pt'}>These browsers offer enhanced compatibility with ChainForge's features. Don't worry, though! We're working to expand our browser support to ensure everyone can enjoy our platform. 😊</Text>
        <Text m='xl' size={'11pt'}>If you have any questions or need assistance, please don't hesitate to reach out on our <a href="https://github.com/ianarawjo/ChainForge/issues">GitHub</a> by <a href="https://github.com/ianarawjo/ChainForge/issues">opening an Issue.</a>
          &nbsp; (If you're a web developer, consider forking our repository and making a <a href="https://github.com/ianarawjo/ChainForge/pulls">Pull Request</a> to support your particular browser.)</Text>
      </Box>
    );
  }
  else return (
    <div>
      <GlobalSettingsModal ref={settingsModal} />
      <AlertModal ref={alertModal} />
      <LoadingOverlay visible={isLoading} overlayBlur={1} />
      <ExampleFlowsModal ref={examplesModal} onSelect={onSelectExampleFlow} />
      <AreYouSureModal ref={confirmationModal} title={confirmationDialogProps.title} message={confirmationDialogProps.message} onConfirm={confirmationDialogProps.onConfirm} />

      {/* <Modal title={'Welcome to ChainForge'} size='400px' opened={welcomeModalOpened} onClose={closeWelcomeModal} yOffset={'6vh'} styles={{header: {backgroundColor: '#FFD700'}, root: {position: 'relative', left: '-80px'}}}>
        <Box m='lg' mt='xl'>
          <Text>To get started, click the Settings icon in the top-right corner.</Text>
        </Box>
      </Modal> */}

      <div style={{ height: '100vh', width: '100%', backgroundColor: '#eee' }}>
        <ReactFlow
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          zoomOnPinch={false}
          zoomOnScroll={false}
          panOnScroll={true}
          // connectionLineComponent={AnimatedConnectionLine}
          // connectionLineStyle={connectionLineStyle}
          snapToGrid={true}
          snapGrid={snapGrid}
          onInit={onInit}
        >
          <Background color="#999" gap={16} />
          <Controls showZoom={true} />
        </ReactFlow>
      </div>
      <div id="custom-controls" style={{ position: 'fixed', left: '10px', top: '10px', zIndex: 8 }}>
      <Menu transitionProps={{ transition: 'pop-top-left' }}
          position="top-start"
          width={220}
          closeOnClickOutside={true}
        >
          <Menu.Target>
            <Button size="sm" variant="gradient" gradient={{ from: 'orange', to: 'red' }} compact mr='sm'>File</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={onClickNewFlow}> New Flow </Menu.Item>
            <Menu.Item onClick={onClickExamples}> Example Flows </Menu.Item>
          <Menu.Divider />
            <Menu.Item onClick={exportFlow}> Export </Menu.Item>
            <Menu.Item onClick={importFlowFromFile}> Import </Menu.Item>
          <Menu.Divider />
            <Menu.Item onClick={onClickSettings}> Settings </Menu.Item>
          </Menu.Dropdown>
        </Menu>
        <Menu transitionProps={{ transition: 'pop-top-left' }}
          position="top-start"
          width={220}
          closeOnClickOutside={true}
        >
          <Menu.Target>
            <Button size="sm" variant="white" c="orange" compact mr='sm'>Add Node +</Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => addTextFieldsNode('input')} icon={<IconTextPlus size="16px" />}> TextFields (In) </Menu.Item>
            <Menu.Item onClick={() => addTextFieldsNode('output')} icon={<IconTextPlus size="16px" />}> TextFields (Out)</Menu.Item>
            <Menu.Item onClick={() => addImageNode('input')} icon={<IconPhoto size="16px" />}> Image (In) </Menu.Item>
            <Menu.Item onClick={() => addImageNode('output')} icon={<IconPhoto size="16px" />}> Image (Out) </Menu.Item>
            {/* <Menu.Item onClick={addPromptNode} icon={'💬'}> Prompt Node </Menu.Item> */}
            <Menu.Item onClick={addToolNode} icon={<IconTools size="16px" />}> Tool Node</Menu.Item>
            {/* <Menu.Item onClick={addModelToolNode} icon={<IconTools size="16px" />}> Tool Node (Model) </Menu.Item>
              <Menu.Item onClick={() => addCodeToolNode('python')} icon={<IconTools size="16px" />}> Tool Node (Code) </Menu.Item> */}
            {/* <Menu.Item onClick={() => addEvalNode('javascript')} icon={<IconTerminal size="16px" />}> JavaScript Evaluator Node </Menu.Item>
            {IS_RUNNING_LOCALLY ? (
              <Menu.Item onClick={() => addEvalNode('python')} icon={<IconTerminal size="16px" />}> Python Evaluator Node </Menu.Item>
            ) : <></>} */}
            {/* <Menu.Item onClick={addVisNode} icon={'📊'}> Vis Node </Menu.Item> */}
            {/* <Menu.Item onClick={addInspectNode} icon={'🔍'}> Inspect Node </Menu.Item> */}
            {/* <Menu.Item onClick={addCsvNode} icon={<IconCsv size="16px" />}> CSV Node </Menu.Item> */}
            {/* <Menu.Item onClick={addTabularDataNode} icon={'🗂️'}> Tabular Data Node </Menu.Item> */}
            {/* <Menu.Item onClick={addCommentNode} icon={'✏️'}> Comment Node </Menu.Item>
            {IS_RUNNING_LOCALLY ? (
              <Menu.Item onClick={addScriptNode} icon={<IconSettingsAutomation size="16px" />}> Global Python Scripts </Menu.Item>
            ) : <></>} */}
          </Menu.Dropdown>
        </Menu>
       
        
      </div>
      <div style={{ position: 'fixed', left: 'calc(50% - 72px)', top: '10px', zIndex: 8 }}>
        <img src={bouquetlogo1} alt="Logo" style={{ display: "inline-block", height: '1.3rem'}}/>
        <Space w="xs"  style={{ display: "inline-block" }} />
        <Text
          fw={700}
          style={{ display: "inline-block", fontSize: '1.5rem'}}
        >
          bouquet
        </Text>
        <Text
          fw={700}
          style={{ display: "inline-block", fontSize: '1.5rem'}}
        >
          .
        </Text>
      </div>
      <div style={{ position: 'fixed', right: '10px', top: '10px', zIndex: 8 }}>
      <Drawer opened={opened} onClose={close} position="right">
          {content}
        </Drawer>
        <Button onClick={open} size="sm" variant="gradient" gradient={{ from: 'orange', to: 'red' }} mr='xs' leftIcon={<IconTools size="1rem" />}>Tool Store</Button>
      </div>
      <div style={{ position: 'fixed', right: '10px', top: '10px', zIndex: 8 }}>
        {IS_RUNNING_LOCALLY ? (<></>) : (
          <Button onClick={onClickShareFlow}
            size="sm" variant="outline" compact
            color={clipboard.copied ? 'teal' : 'blue'}
            mr='xs' style={{ float: 'left' }}>
            {waitingForShare ? <Loader size='xs' mr='4px' /> : <IconFileSymlink size="16px" />}
            {clipboard.copied ? 'Link copied!' : (waitingForShare ? 'Sharing...' : 'Share')}
          </Button>
        )}
      </div>
      {/* <div style={{ position: 'fixed', right: '10px', bottom: '20px', zIndex: 8 }}>
        <a href='https://forms.gle/AA82Rbn1X8zztcbj8' target="_blank" style={{ color: '#666', fontSize: '11pt' }}>Send us feedback</a>
      </div> */}
    </div>
  );
};

export default App;