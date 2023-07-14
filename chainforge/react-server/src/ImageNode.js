import { useState } from 'react';
import { IconPhoto } from '@tabler/icons-react';
import NodeLabel from './NodeLabelComponent';
import { Handle } from 'react-flow-renderer';

const ImageNode = ({ data, id }) => {
  const [image, setImage] = useState(data.image || null);
  const IS_INPUT = data.iotype === 'input';

  const handleFileInputChange = (event) => {
    const file = event.target.files[0];
    const url = URL.createObjectURL(file);
    const image = document.getElementById(id + "imagein");
    image.setAttribute("src", url);
    console.error(file);
    if (file) {
      const reader = new FileReader();

      // Read the file as an ArrayBuffer
      reader.readAsArrayBuffer(file);

      reader.onload = (e) => {
        const value = e.target.result;
        setImage(value);
        data['image'] = value;
      }
    }
  };

  const saveOutput = async (event) => {
    const url = document.getElementById(id + "imageout").src;
    console.error(url);
    const imageBlob = await fetch(url).then(r => r.blob());
    setImage(imageBlob);
    data['image'] = imageBlob;
    console.error(image);
    if (data['image'])
      console.error('Saved to data!');
  }

  return (
    <div className="prompt-node cfnode">
      <NodeLabel title={data.title || IS_INPUT ? 'Image Node (In)' : 'Image Node (Out)'}
        nodeId={id}
        icon={<IconPhoto size="16px" />}
      />
      <Handle
        type="source"
        position="right"
        id="prompt"
        style={{ top: '50%', background: '#555' }}
      />
      {IS_INPUT ?
        <div></div> :
        <Handle
          type="target"
          position="left"
          id="input"
          style={{ top: '50%', background: '#555' }}
        />
      }
      {IS_INPUT ?
        <div>Upload an image: <br />
          {/* <FileInput
          placeholder="file"
          label="Upload an image file:"
          onChange={handleFileInputChange}
          withAsterisk
        /> */}
          <input type="file" onChange={handleFileInputChange} />
          <img id={id + "imagein"} style={{ width: '290px' }}></img>
        </div>
        :
        <div>Output: <br />
          <img id={id + "imageout"} style={{ width: '290px' }}></img>
          <button onClick={saveOutput}>Save output to node data</button>
        </div>
      }
    </div>
  );
}

export default ImageNode;
