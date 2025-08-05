const fs = require('fs-extra');
const path = require('path');

const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

const deleteDirectory = async (dirPath) => {
  try {
    await fs.remove(dirPath);
    return true;
  } catch (error) {
    console.error('Error deleting directory:', error);
    return false;
  }
};

const ensureDirectory = async (dirPath) => {
  try {
    await fs.ensureDir(dirPath);
    return true;
  } catch (error) {
    console.error('Error creating directory:', error);
    return false;
  }
};

module.exports = {
  deleteFile,
  deleteDirectory,
  ensureDirectory
};