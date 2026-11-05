USE BankManagement;
DELIMITER //

DROP PROCEDURE IF EXISTS DepositMoney//
CREATE PROCEDURE DepositMoney(IN acc INT, IN amt DECIMAL(12,2))
BEGIN
    IF amt IS NULL OR amt <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid amount';
    END IF;

    START TRANSACTION;

    UPDATE Account
    SET Account_Amount = Account_Amount + amt
    WHERE Account_ID = acc;

	INSERT INTO Transactions
	(Account_ID, Transaction_Type, Amount, Date)
	VALUES (acc, 'Deposit', amt, CURDATE());
    COMMIT;
END//

DROP PROCEDURE IF EXISTS WithdrawMoney//

CREATE PROCEDURE WithdrawMoney(
    IN acc INT, IN amt DECIMAL(12,2)
)
BEGIN
    IF amt IS NULL OR amt <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid amount';
    END IF;

    START TRANSACTION;

    UPDATE Account
    SET Account_Amount = Account_Amount - amt
    WHERE Account_ID = acc
      AND Account_Amount >= amt
      AND Transaction_Limit >= amt;

	INSERT INTO Transactions
	(Account_ID, Transaction_Type, Amount, Date)
	VALUES (acc, 'Withdrawal', amt, CURDATE());

	COMMIT;
END//


DROP PROCEDURE IF EXISTS TransferMoney//

CREATE PROCEDURE TransferMoney(
    IN sender INT, IN receiver INT, IN amt DECIMAL(12,2)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF amt IS NULL OR amt <= 0
       OR sender IS NULL OR receiver IS NULL
       OR sender = receiver THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid transfer';
    END IF;

    START TRANSACTION;

    UPDATE Account
    SET Account_Amount = Account_Amount - amt
    WHERE Account_ID = sender
      AND Account_Amount >= amt
      AND Transaction_Limit >= amt;

    IF ROW_COUNT() != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Transfer rejected';
    END IF;

    UPDATE Account
    SET Account_Amount = Account_Amount + amt
    WHERE Account_ID = receiver;

    IF ROW_COUNT() != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Receiver not found';
    END IF;

    INSERT INTO Transactions
    (Account_ID, Transaction_Type, Amount,
     Date, Receiver_Account)
    VALUES
    (sender, 'Transfer', amt, CURDATE(), receiver);

    COMMIT;
END//


DROP PROCEDURE IF EXISTS CheckBalance//

CREATE PROCEDURE CheckBalance(IN acc INT)
BEGIN
    SELECT Account_ID, Account_Amount
    FROM Account
    WHERE Account_ID = acc;
END//


DROP PROCEDURE IF EXISTS TransactionHistory//

CREATE PROCEDURE TransactionHistory(IN acc INT)
BEGIN
    SELECT *
    FROM Transactions
    WHERE Account_ID = acc
    ORDER BY Transaction_ID DESC;
END//


DROP PROCEDURE IF EXISTS PayBill//

CREATE PROCEDURE PayBill(
    IN acc INT,
    IN biller VARCHAR(100),
    IN amt DECIMAL(12,2)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF amt IS NULL OR amt <= 0 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Invalid amount';
    END IF;

    START TRANSACTION;

    UPDATE Account
    SET Account_Amount = Account_Amount - amt
    WHERE Account_ID = acc
      AND Account_Amount >= amt
      AND Transaction_Limit >= amt;

    IF ROW_COUNT() != 1 THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Payment rejected';
    END IF;

    INSERT INTO Payment
    (Account_ID, Payment_Type, Payment_Amount,
     Biller_Name, Biller_Amount)
    VALUES
    (acc, 'Bill', amt, biller, amt);

    COMMIT;
END//

DELIMITER ;
