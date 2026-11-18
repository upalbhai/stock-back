import mongoose from "mongoose";

export const withTransaction = async (callback) => {
  // In development environments without a replica set, transactions will throw an error.
  // We can bypass transactions by passing null as the session.
  if (process.env.NODE_ENV !== 'production' && process.env.USE_TRANSACTIONS !== 'true') {
    return await callback(null);
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const result = await callback(session);

    await session.commitTransaction();

    return result;
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
};
