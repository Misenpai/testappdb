import { PrismaClient } from '../../generated/prisma/index.js'
const prisma = new PrismaClient();

export const connectDB = async () => {
  try {
    await prisma.$connect();
    return {
      success: true,
      message: "Successfully connected to MySQL Database",
    };
  } catch (error) {
    return {
      success: false,
      message: "Failed to connect to Database",
      error: error instanceof Error ? error.message : error,
    };
  }
};

export default prisma;


