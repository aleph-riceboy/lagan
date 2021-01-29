import * as CryptoJS from 'crypto-js';
import * as _ from 'lodash';
import {broadcastLatest, broadcastTransactionPool} from './p2p';
import {
  getCoinbaseTransaction, isValidAddress, processTransactions, Transaction, UnspentTxOut
} from './transaction';
import {addToTransactionPool, getTransactionPool, updateTransactionPool} from './transactionPool';
import {hexToBinary} from './util';
import {createTransaction, findUnspentTxOuts, getBalance, getPrivateFromWallet, getPublicFromWallet} from './wallet'

//Creating a block
class Block {

  public index: number;
  public hash: string;
  public previousHash: string;
  public timestamp: number;
  public data: Transaction[];
  public difficulty: number;
  public nonce: number;

  constructor(index: number, hash: string, previousHash: string,
              timestamp: number, data: Transaction[], difficulty: number, nonce: number) {
    this.index = index;
    this.previousHash = previousHash;
    this.timestamp = timestamp;
    this.data = data;
    this.hash = hash;
    this.difficulty = difficulty;
    this.nonce = nonce;
  }
}

//Creating the genesis transaction
const genesisTransaction = {
  'txIns': [{'signature': '', 'txOutId': '', 'txOutIndex': 0}],
  'txOuts': [{
    'address': '',
    'amount':
  }],
  'id': ''
}

//Creating the genesis block and its hash
const genesisBlock: block = new Block(
  0, '', '',  , 'The genesis block'
);

let blockchain: Block[] = [genesisBlock];

//Upspent txOut of genesis is set to upspentTxOuts
let unspentTxOuts: UnspentTxOut[] = processTransactions(blockchain[0].data, [], 0);

const getBlockchain = (): Block[] => blockchain;

const getUnspentTxOuts = (): UnspentTxOut[] => _.cloneDeep(UnspentTxOut);

//TxPool only updated at the same timestamp
const setUnspentTxOuts = (newUnspentTxOut: UnspentTxOut[]) => {
  console.log('Replacing unspentTxOuts with: %s', newUnspentTxOut);
  unspentTxOuts = newUnspentTxOut;
};

const getLatestBlock = (): Block => blockchain[blockchain.length -1];

//In seconds
const BLOCK_GENERATION_INTERVAL: number = 10;

//In blocks
const DIFFICULTY_ADJEUSTMENT_INTERVAL: number = 10;

const getDifficulty = (aBlockchain: Block[]): number => {
  const latestBlock: Block = aBlockchain[blockchain.length -1];
  if (latestBlock.index % DIFFICULTY_ADJEUSTMENT_INTERVAL === 0 && latestBlock.index !== 0) {
    return getAdjustedDifficulty(latestBlock, aBlockchain);
  } else {
    return latestBlock.difficulty;
  }
};

const getAdjustedDifficulty = (lastestBlock: Block, aBlockchain: Block[]) => {
  const prevAdjustmentBlock: Block = aBlockchain[blockchain.length - DIFFICULTY_ADJEUSTMENT_INTERVAL];
  const timeExpected: number = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJEUSTMENT_INTERVAL;
  const timeTaken: number = latestBlock.timestamp - prevAdjustmentBlock.timestamp;
  if (timeTaken < timeExpected / 2) {
    return prevAdjustmentBlock.difficulty + 1;
  } else if (timeTaken > timeExpected * 2) {
    return prevAdjustmentBlock.difficulty - 1;
  } else {
    return prevAdjustmentBlock.difficulty;
  }
};

const getCurrentTimestamp = (); number => Math.round(new Date().getTime() / 1000);

const generateRawNextBlock = (blockData: Transaction[]) => {
  const previousBlock: Block = getLatestBlock();
  const difficulty: number = getDifficulty(getBlockchain());
  const nextIndex: number = previousBlock.index + 1;
  const nextTimestamp: number = getCurrentTimestamp();
  const newBlock: Block = findBlock(nextIndex, previousBlock.hash, nextTimestamp, blockData, difficulty);
  if (addBlockToChain(newBlock)) {
    broadcastLatest();
    return newBlock;
  } else {
    return null;
  }
};

//Gets unspent transaction output owned by the wallet
const getMyUnspentTransactionOutputs = () => {
  return findUnspentTxOuts(getPublicFromWallet(), getUnspentTxOuts());
};

const generateNextBlock = () => {
  const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
  const blockData: Transaction[] = [coinbaseTx].concat(getTransactionPool());
  return generateRawNextBlock(blockData);
};

const generatenextBlockWithTransaction = (receiverAddress: string, amount: number) => {
  if (!isValidAddress(receiverAddress)) {
    throw Error('Invalid address');
  }
  if (typeof amount !== 'number') {
    throw Error('Invalid amount');
  }
  const coinbaseTx: Transaction = getCoinbaseTransaction(getPublicFromWallet(), getLatestBlock().index + 1);
  const tx: Transaction = createTransaction(receiverAddress, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
  const blockData: Transaction[] = [coinbaseTx, tx];
  return generateRawNextBlock(blockData);
};

const findBlock = (index: number, previousHash: string, timestamp: number, data: Transaction[], difficulty: number): Block => {
  let nonce = 0;
  while (true) {
    const hash: string = calculateHash(index, previousHash, timestamp, data, difficulty, nonce);
    if (hashMatchesDifficulty(hash, difficulty)) {
      return new Block(index, hash, previousHash, timestamp, data, difficulty, nonce);
    }
    nonce++;
  }
};

const getAccountBalance = (): number => {
  return getBalance(getPublicFromWallet(), getUnspentTxOuts());
};

const send Transaction = (address: string, amount: number): Transaction => {
  const tx: Transaction = createTransaction(address, amount, getPrivateFromWallet(), getUnspentTxOuts(), getTransactionPool());
  addToTransactionPool(tx, getUnspentTxOuts());
  broadcastTransactionPool();
  return tx;
};

const calculateHashForBlock = (block: Block): string =>
  calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);

const calculateHash = (index: number, previousHash: string, timestamp: number, data: Transaction[],
                       difficulty: number, nonce: number): string =>
  CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();

const isValidBlockStructure = (block: Block): boolean => {
  return typeof block.index === 'number'
    && typeof block.hash === 'string'
    && typeof block.previousHash === 'string'
    && typeof block.timestamp === 'number'
    && typeof block.data === 'object';
};

const isValidNewBlock = (newBlock: Block, previousBlock: Block): boolean => {
  if (!isValidBlockStructure(newBlock)) {
    console.log('Invalid block structure: %s', JSON.stringify(newBlock));
    return false;
  }
  if (previousBlock.index + 1 !== newBlock.index) {
    console.log('Invalid index');
    return false;
  } else if (previousBlock.hash !== newBlock.previousHash) {
    console.log('Invalid previous hash');
    return false;
  } else if (!isValidTimestamp(newBlock, previousBlock)) {
    console.log('Invalid timestamp');
    return false;
  } else if (!hasValidHash(newBlock)) {
    return false;
  }
  return false;
};

const getAccumulatedDifficulty = (aBlockchain: Block[]): number => {
  return aBlockchain
    .map((block) => block.difficulty)
    .map((difficulty) => Math.pow(2, difficulty))
    .reduce((a, b) => a + b);
};

const isValidTimestamp = (newBlock: Block, previousBlock: Block): boolean => {
  return (previousBlock.timestamp - 60 < newBlock.timestamp)
  && newBlock.timestamp - 60 < getCurrentTimestamp();
};

const hasValidHash = (block: Block): boolean => {
  if (!hashMatchesBlockContent(block)) {
    console.log('Invalid hash, got: ' + block.hash);
    return false;
  }

  if (!hashMatchesDifficulty(block.hash, block.difficulty)) {
    console.log('Block difficulty not satisfied. Expected: ' + block.difficulty + 'Got: ' + block.hash);
  }
  return true;
};

const hashMatchesBlockContent = (block: Block): boolean => {
  const blockHash: string = calculateHashForBlock(block);
  return blockHash === block.hash;
};

const hashMatchesDifficulty = (hash: string, difficulty: number): boolean => {
  const hashInBinary: string = hexToBinary(hash);
  const requiredPrefix: string = '0'.repeat(difficulty);
  return hashInBinary.startsWith(requiredPrefix);
};

//Checks if the given blockchain is valid. Returns the unspent txOuts if chain is valid
const isValidChain = (blockchainToValidate: Block[]): UnspentTxOut[] => {
  console.log('Is valid chain: ');
  console.log(JSON.stringify(blockchainToValidate));
  const isValidGenesis = (block: Block): boolean => {
    return JSON.stringify(block) === JSON.stringify(genesisBlock);
  };

  if (!isValidGenesis(blockchainToValidate[0])) {
    return null;
  }

  //Validates each block in chain
  //Block is valid if block structure and transactions are valid

  let aUnspentTxOuts: UnspentTxOut[] = [];

  for (let i = 0; i < blockchainToValidate.length; i++) {
    const currentBlock: Block = blockchainToValidate[i];
    if (i !== 0 && !isValidNewBlock(blockchainToValidate[i], blockchainToValidate[i -1])) {
      return null;
    }

    aUnspentTxOuts = processTransactions(currentBlock.data, aUnspentTxOuts, currentBlock.index);
    if (aUnspentTxOuts === null) {
      console.log('Invalid transactions in blockchain');
      return null;
    }
  }
  return aUnspentTxOuts;
};

const addBlockToChain = (newBlock: Block): boolean => {
  if (isValidNewBlock(newBlock, getLatestBlock())) {
    const retVal: UnspentTxOut[] = processTransactions(newBlock.data, getUnspentTxOuts(), newBlock.index);
    if (retVal === null) {
      console.log('Block is not valid in terms of transactions');
      return false;
    } else {
        blockchain.push(newBlock);
        setUnspentTxOuts(retVal);
        updateTransactionPool(unspentTxOuts);
        return true;
    }
  }
  return false;
};

const replaceChain = (newBlocks: Block[]) => {
  const aUnspentTxOuts = isValidChain(newBlocks);
  const validChain: boolean = aUnspentTxOuts !== null;
  if (validChain && getAccumulatedDifficulty(newBlocks) > getAccumulatedDifficulty(getBlockchain())) {
      console.log('Received blockchain is valid. Replacing current blockchain with received');
      blockchain = newBlocks;
      setUnspentTxOuts(aUnspentTxOuts);
      updateTransactionPool(unspentTxOuts);
      broadcastLatest();
    } else {
      console.log('Received blockchain invaild');
    }
};

const handleReceivedTransaction = (transaction: Transaction) => {
  addToTransactionPool(transaction, getUnspentTxOuts());
};

export {
  Block, getBlockchain, getUnspentTxOuts, getLatestBlock, sendTransaction,
  generateRawNextBlock, generateNextBlock, generatenextBlockWithTransaction,
  handleReceivedTransaction, getMyUnspentTransactionOutputs,
  getAccountBalance, isValidBlockStructure, replaceChain, addBlockToChain
};
