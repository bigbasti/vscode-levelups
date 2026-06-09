package demo;

import java.math.BigInteger;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface TmpMqMessageIncomingRepository
        extends JpaRepository<ZebraTmpMqMessageIncoming, BigInteger> {

    @Query("SELECT i FROM ZebraTmpMqMessageIncoming i WHERE i.messageId = :messageId")
    Optional<ZebraTmpMqMessageIncoming> findByMessageId(@Param("messageId") String messageId);

    @Query("SELECT i FROM ZebraTmpMqMessageIncoming i WHERE i.id = :id")
    Page<ZebraTmpMqMessageIncoming> findById(@Param("id") BigInteger id, Pageable pageable);

    // Concatenated multi-line query
    @Query("SELECT i FROM ZebraTmpMqMessageIncoming i "
            + "WHERE i.status = :status "
            + "ORDER BY i.createdAt DESC")
    Page<ZebraTmpMqMessageIncoming> findByStatus(@Param("status") String status, Pageable pageable);

    // Native SQL query
    @Query(value = "SELECT * FROM zebra_tmp_mq_message_incoming WHERE id = :id", nativeQuery = true)
    Optional<ZebraTmpMqMessageIncoming> findNative(@Param("id") BigInteger id);

    // Java text block (multi-line)
    @Query("""
            SELECT i FROM ZebraTmpMqMessageIncoming i
            WHERE i.messageId = :messageId
              AND i.status = :status
            """)
    Optional<ZebraTmpMqMessageIncoming> findBlock(@Param("messageId") String messageId,
                                                  @Param("status") String status);
}
